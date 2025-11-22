import { useNotification } from '../context/NotificationContext';

const notificationStyles = {
  success: 'bg-emerald-500 text-white',
  error: 'bg-red-500 text-white',
  warning: 'bg-orange-500 text-white',
  info: 'bg-primary-500 text-white',
};

export default function NotificationContainer() {
  const { notifications, removeNotification } = useNotification();

  return (
    <div className="fixed top-5 right-5 z-50 flex flex-col gap-3 max-w-md">
      {notifications.map((notification) => (
        <div
          key={notification.id}
          className={`
            flex items-center justify-between min-w-[300px] px-5 py-4 rounded-lg shadow-lg
            cursor-pointer animate-slide-in hover:-translate-x-1 transition-transform duration-200
            ${notificationStyles[notification.type]}
          `}
          onClick={() => removeNotification(notification.id)}
        >
          <div className="flex items-center gap-3 flex-1">
            <span className="text-xl font-bold flex items-center justify-center w-6 h-6">
              {notification.type === 'success' && '✓'}
              {notification.type === 'error' && '✕'}
              {notification.type === 'warning' && '⚠'}
              {notification.type === 'info' && 'ℹ'}
            </span>
            <span className="flex-1 text-[0.95rem] leading-relaxed">{notification.message}</span>
          </div>
          <button
            className="ml-2 w-6 h-6 flex items-center justify-center text-2xl
                     hover:bg-black/10 rounded transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              removeNotification(notification.id);
            }}
            aria-label="Close notification"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
