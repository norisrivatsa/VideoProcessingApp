import boto3
import time
import logging
import os
from typing import Dict, List, Optional
from botocore.exceptions import ClientError, NoCredentialsError
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)


class AWSRekognitionAnalyzer:
    """
    Video content analyzer using AWS Rekognition
    Analyzes video content for inappropriate/unsafe material
    """

    def __init__(self):
        """Initialize AWS clients"""
        aws_access_key_id = os.getenv("AWS_ACCESS_KEY_ID")
        aws_secret_access_key = os.getenv("AWS_SECRET_ACCESS_KEY")
        aws_region = os.getenv("AWS_REGION", "us-east-1")
        aws_s3_bucket = os.getenv("AWS_S3_BUCKET")

        if not aws_access_key_id or not aws_secret_access_key:
            raise ValueError("AWS credentials not configured. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in .env")

        if not aws_s3_bucket:
            raise ValueError("AWS S3 bucket not configured. Set AWS_S3_BUCKET in .env")

        try:
            # Initialize AWS clients
            self.s3_client = boto3.client(
                's3',
                aws_access_key_id=aws_access_key_id,
                aws_secret_access_key=aws_secret_access_key,
                region_name=aws_region
            )

            self.rekognition_client = boto3.client(
                'rekognition',
                aws_access_key_id=aws_access_key_id,
                aws_secret_access_key=aws_secret_access_key,
                region_name=aws_region
            )

            logger.info("AWS Rekognition Analyzer initialized successfully")

        except NoCredentialsError:
            raise ValueError("Invalid AWS credentials")
        except Exception as e:
            logger.error(f"Error initializing AWS clients: {e}")
            raise

    def upload_to_s3(self, local_file_path: str, s3_key: str) -> str:
        """
        Upload video file to S3

        Args:
            local_file_path: Path to local video file
            s3_key: S3 object key (path in bucket)

        Returns:
            S3 URI of uploaded file
        """
        aws_s3_bucket = os.getenv("AWS_S3_BUCKET")
        try:
            logger.info(f"Uploading {local_file_path} to S3 bucket {aws_s3_bucket}")

            # Upload file to S3
            self.s3_client.upload_file(
                local_file_path,
                aws_s3_bucket,
                s3_key,
                ExtraArgs={'ContentType': 'video/mp4'}
            )

            s3_uri = f"s3://{aws_s3_bucket}/{s3_key}"
            logger.info(f"Successfully uploaded to {s3_uri}")

            return s3_uri

        except ClientError as e:
            logger.error(f"Error uploading to S3: {e}")
            raise
        except Exception as e:
            logger.error(f"Unexpected error during S3 upload: {e}")
            raise

    def get_s3_url(self, s3_key: str, expiration: int = 3600) -> str:
        """
        Generate presigned URL for S3 object

        Args:
            s3_key: S3 object key
            expiration: URL expiration time in seconds (default 1 hour)

        Returns:
            Presigned URL
        """
        aws_s3_bucket = os.getenv("AWS_S3_BUCKET")
        try:
            url = self.s3_client.generate_presigned_url(
                'get_object',
                Params={
                    'Bucket': aws_s3_bucket,
                    'Key': s3_key
                },
                ExpiresIn=expiration
            )
            return url
        except Exception as e:
            logger.error(f"Error generating presigned URL: {e}")
            raise

    def start_content_moderation(self, s3_key: str) -> str:
        """
        Start AWS Rekognition content moderation job

        Args:
            s3_key: S3 object key of video

        Returns:
            Job ID for tracking
        """
        aws_s3_bucket = os.getenv("AWS_S3_BUCKET")
        rekognition_min_confidence = float(os.getenv("REKOGNITION_MIN_CONFIDENCE", "60.0"))

        try:
            logger.info(f"Starting content moderation for {s3_key}")

            response = self.rekognition_client.start_content_moderation(
                Video={
                    'S3Object': {
                        'Bucket': aws_s3_bucket,
                        'Name': s3_key
                    }
                },
                MinConfidence=rekognition_min_confidence
            )

            job_id = response['JobId']
            logger.info(f"Content moderation job started: {job_id}")

            return job_id

        except ClientError as e:
            logger.error(f"Error starting content moderation: {e}")
            raise
        except Exception as e:
            logger.error(f"Unexpected error starting moderation: {e}")
            raise

    def get_content_moderation_results(self, job_id: str) -> Dict:
        """
        Get content moderation results (non-blocking)

        Args:
            job_id: Rekognition job ID

        Returns:
            Dictionary with job status and results
        """
        try:
            response = self.rekognition_client.get_content_moderation(
                JobId=job_id,
                SortBy='TIMESTAMP'
            )

            status = response['JobStatus']

            result = {
                'status': status,  # IN_PROGRESS, SUCCEEDED, FAILED
                'moderation_labels': []
            }

            if status == 'SUCCEEDED':
                result['moderation_labels'] = response.get('ModerationLabels', [])
                logger.info(f"Job {job_id} completed with {len(result['moderation_labels'])} labels")
            elif status == 'FAILED':
                logger.error(f"Job {job_id} failed")

            return result

        except ClientError as e:
            logger.error(f"Error getting moderation results: {e}")
            raise
        except Exception as e:
            logger.error(f"Unexpected error getting results: {e}")
            raise

    def wait_for_job_completion(self, job_id: str) -> Dict:
        """
        Poll for job completion (blocking)

        Args:
            job_id: Rekognition job ID

        Returns:
            Final job results
        """
        rekognition_poll_interval = int(os.getenv("REKOGNITION_POLL_INTERVAL", "5"))
        rekognition_max_wait = int(os.getenv("REKOGNITION_MAX_WAIT", "300"))

        elapsed_time = 0
        while elapsed_time < rekognition_max_wait:
            result = self.get_content_moderation_results(job_id)

            if result['status'] in ['SUCCEEDED', 'FAILED']:
                return result

            logger.info(f"Job {job_id} still in progress... ({elapsed_time}s elapsed)")
            time.sleep(rekognition_poll_interval)
            elapsed_time += rekognition_poll_interval

        raise TimeoutError(f"Job {job_id} did not complete within {rekognition_max_wait} seconds")

    def parse_moderation_labels(self, moderation_labels: List[Dict]) -> Dict:
        """
        Parse Rekognition moderation labels into actionable results

        Args:
            moderation_labels: List of moderation labels from Rekognition

        Returns:
            Dictionary with analysis results
        """
        # Categories to flag
        flagged_categories = {
            'Explicit Nudity', 'Nudity', 'Graphic Male Nudity', 'Graphic Female Nudity',
            'Sexual Activity', 'Illustrated Explicit Nudity', 'Adult Toys',
            'Violence', 'Graphic Violence', 'Physical Violence', 'Weapon Violence',
            'Weapons', 'Self Injury', 'Emaciated Bodies', 'Corpses',
            'Hanging', 'Air Crash', 'Explosions And Blasts',
            'Visually Disturbing', 'Gambling', 'Hate Symbols',
            'Rude Gestures', 'Middle Finger'
        }

        # Suggestive categories (lower severity, might not flag depending on context)
        suggestive_categories = {
            'Suggestive', 'Female Swimwear Or Underwear', 'Male Swimwear Or Underwear',
            'Revealing Clothes', 'Partial Nudity'
        }

        flags = []
        max_confidence = 0
        label_details = []

        for label_data in moderation_labels:
            label = label_data.get('ModerationLabel', {})
            label_name = label.get('Name', '')
            confidence = label.get('Confidence', 0)
            timestamp = label_data.get('Timestamp', 0)
            parent_name = label.get('ParentName', '')

            # Store label details
            label_details.append({
                'name': label_name,
                'confidence': confidence,
                'timestamp': timestamp,
                'parent': parent_name
            })

            # Track max confidence
            if confidence > max_confidence:
                max_confidence = confidence

            # Check if should be flagged
            if label_name in flagged_categories or parent_name in flagged_categories:
                if label_name not in flags:
                    flags.append(label_name)

        # Determine if video should be flagged
        is_flagged = len(flags) > 0

        # Categorize flags
        violence_flags = [f for f in flags if 'violence' in f.lower() or 'weapon' in f.lower()]
        nsfw_flags = [f for f in flags if 'nudity' in f.lower() or 'sexual' in f.lower()]
        disturbing_flags = [f for f in flags if 'disturbing' in f.lower() or 'corpse' in f.lower() or 'injury' in f.lower()]
        other_flags = [f for f in flags if f not in violence_flags + nsfw_flags + disturbing_flags]

        return {
            'is_flagged': is_flagged,
            'is_safe': not is_flagged,
            'flags': flags,
            'violence_flags': violence_flags,
            'nsfw_flags': nsfw_flags,
            'disturbing_flags': disturbing_flags,
            'other_flags': other_flags,
            'confidence': max_confidence,
            'total_labels': len(moderation_labels),
            'label_details': label_details[:10]  # Top 10 labels
        }

    def analyze_video_sync(self, local_file_path: str, s3_key: str) -> Dict:
        """
        Synchronous video analysis (blocking)
        Upload to S3, analyze, wait for results

        Args:
            local_file_path: Path to local video file
            s3_key: S3 object key for storage

        Returns:
            Analysis results dictionary
        """
        try:
            # Upload to S3
            s3_uri = self.upload_to_s3(local_file_path, s3_key)

            # Start moderation job
            job_id = self.start_content_moderation(s3_key)

            # Wait for completion
            logger.info(f"Waiting for job {job_id} to complete...")
            job_result = self.wait_for_job_completion(job_id)

            if job_result['status'] == 'FAILED':
                raise Exception("Rekognition job failed")

            # Parse results
            analysis = self.parse_moderation_labels(job_result['moderation_labels'])

            # Add metadata
            analysis['job_id'] = job_id
            analysis['s3_uri'] = s3_uri
            analysis['s3_key'] = s3_key

            logger.info(f"Analysis complete: Flagged={analysis['is_flagged']}, Flags={analysis['flags']}")

            return analysis

        except Exception as e:
            logger.error(f"Error during video analysis: {e}")
            raise

    def analyze_video_async(self, local_file_path: str, s3_key: str) -> Dict:
        """
        Asynchronous video analysis (non-blocking)
        Upload to S3, start analysis, return immediately

        Args:
            local_file_path: Path to local video file
            s3_key: S3 object key for storage

        Returns:
            Dictionary with job_id for tracking
        """
        try:
            # Upload to S3
            s3_uri = self.upload_to_s3(local_file_path, s3_key)

            # Start moderation job
            job_id = self.start_content_moderation(s3_key)

            return {
                'job_id': job_id,
                's3_uri': s3_uri,
                's3_key': s3_key,
                'status': 'IN_PROGRESS'
            }

        except Exception as e:
            logger.error(f"Error starting async analysis: {e}")
            raise
