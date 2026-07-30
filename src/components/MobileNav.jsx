import React from 'react';
import { Home, Truck, Bell, UserRound } from 'lucide-react';
// Assuming CLIENT_VIEWS is imported or we just hardcode the strings

export default function MobileNav({ currentView, onNavigate, notificationCount = 0 }) {
  const navItems = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'my-inquiries', label: 'My Inquiries', icon: Truck },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'profile', label: 'Profile', icon: UserRound }
  ];

  return (
    <nav className="mobile-bottom-nav" aria-label="Primary">
      {navItems.map((item) => {
        const isActive = currentView === item.id;
        return (
          <button
            key={item.id}
            className={`mobile-nav-item ${isActive ? 'active' : ''}`}
            onClick={() => onNavigate(item.id)}
            type="button"
            // The active state was a colour change only, which conveys nothing to
            // a screen reader and fails contrast-independence.
            aria-current={isActive ? 'page' : undefined}
          >
            <span className="mobile-nav-icon-wrap">
              <item.icon size={22} className="nav-icon" />
              {item.id === 'notifications' && notificationCount > 0 && (
                <span className="notification-badge" aria-label={`${notificationCount} unread notifications`}>
                  {notificationCount}
                </span>
              )}
            </span>
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
