import { useState } from 'react';
import { useApolloClient, useMutation, useQuery } from '@apollo/client/react';
import { Bell, CheckCheck, ChevronDown, Layers3, LogOut, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { MARK_ALL_NOTIFICATIONS_READ, MARK_NOTIFICATION_READ, MY_NOTIFICATIONS } from '../graphql/operations.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { ErrorMessage, LoadingState } from './Feedback.jsx';

export default function AppShell({ children, user }) {
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [notificationLimit, setNotificationLimit] = useState(10);
  const notificationVariables = { limit: notificationLimit, offset: 0 };
  const navigate = useNavigate();
  const client = useApolloClient();
  const { logout } = useAuth();
  const { data, loading, error } = useQuery(MY_NOTIFICATIONS, { variables: notificationVariables });
  const [markRead, markReadState] = useMutation(MARK_NOTIFICATION_READ, {
    refetchQueries: [{ query: MY_NOTIFICATIONS, variables: notificationVariables }],
    awaitRefetchQueries: true,
  });
  const [markAllRead, markAllState] = useMutation(MARK_ALL_NOTIFICATIONS_READ, {
    refetchQueries: [{ query: MY_NOTIFICATIONS, variables: notificationVariables }],
    awaitRefetchQueries: true,
  });
  const notifications = data?.myNotifications ?? [];
  const unreadCount = notifications.filter((notification) => !notification.read).length;

  async function handleLogout() {
    logout();
    await client.clearStore();
    navigate('/login', { replace: true });
  }

  return (
    <div className={`app-frame ${sidebarOpen ? '' : 'sidebar-collapsed'}`}>
      <aside className="sidebar">
        <Link to="/" className="brand-lockup sidebar-brand">
          <span className="brand-symbol"><Layers3 size={19} /></span>
          <span>DevHub</span>
        </Link>
        <div className="workspace-label">YOUR WORKSPACE</div>
        <NavLink to="/" end className={({ isActive }) => `side-link ${isActive ? 'active' : ''}`}>
          <span className="nav-glyph">01</span><span>Organizations</span>
        </NavLink>
        <div className="sidebar-bottom">
          <div className="sidebar-user-mark">{user.name.slice(0, 1).toUpperCase()}</div>
          <div className="sidebar-user-copy"><strong>{user.name}</strong><span>{user.email}</span></div>
          <button className="icon-button sidebar-logout" type="button" onClick={handleLogout} aria-label="Sign out" title="Sign out">
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      <div className="app-main">
        <header className="topbar">
          <button className="icon-button sidebar-toggle" type="button" onClick={() => setSidebarOpen((open) => !open)} aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'} title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}>
            {sidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
          </button>
          <div className="breadcrumb"><span>DEVHUB</span><i>/</i><strong>Workspace</strong></div>
          <div className="topbar-actions">
            <div className="notification-anchor">
              <button className={`icon-button notification-trigger ${notificationsOpen ? 'selected' : ''}`} type="button" onClick={() => setNotificationsOpen((open) => !open)} aria-label="Notifications" title="Notifications">
                <Bell size={18} />
                {unreadCount > 0 && <span className="notification-dot">{unreadCount > 9 ? '9+' : unreadCount}</span>}
              </button>
              {notificationsOpen && (
                <section className="notification-popover" aria-label="Notifications">
                  <div className="popover-heading">
                    <div><span className="eyebrow">INBOX</span><h2>Notifications</h2></div>
                    <button className="text-action" type="button" disabled={!unreadCount || markAllState.loading} onClick={() => markAllRead()}>
                      <CheckCheck size={15} /> Mark all read
                    </button>
                  </div>
                  <ErrorMessage error={error || markReadState.error || markAllState.error} />
                  {loading ? <LoadingState label="Loading notifications" /> : notifications.length ? (
                    <div className="notification-list">
                      {notifications.map((notification) => (
                        <button className={`notification-item ${notification.read ? '' : 'unread'}`} key={notification.id} type="button" onClick={() => !notification.read && markRead({ variables: { id: notification.id } })}>
                          <span className="notification-state" />
                          <span className="notification-copy"><strong>{notification.type.replaceAll('_', ' ').toLowerCase()}</strong><span>{notification.message}</span><small>{formatDate(notification.createdAt)}</small></span>
                          {!notification.read && <ChevronDown className="notification-chevron" size={15} />}
                        </button>
                      ))}
                    </div>
                  ) : <div className="popover-empty">You’re all caught up.</div>}
                  {notifications.length >= notificationLimit && <button className="text-action notification-more" type="button" onClick={() => setNotificationLimit((limit) => limit + 10)}>Load older notifications <ChevronDown size={14} /></button>}
                </section>
              )}
            </div>
            <div className="topbar-avatar" title={user.name}>{user.name.slice(0, 1).toUpperCase()}</div>
          </div>
        </header>
        <main className="page-content">{children}</main>
      </div>
    </div>
  );
}

function formatDate(value) {
  const normalized = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime())
    ? 'Unknown date'
    : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
}
