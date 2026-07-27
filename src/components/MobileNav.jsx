import React from 'react';
import { Home, Truck, Bell, UserRound } from 'lucide-react';
// Assuming CLIENT_VIEWS is imported or we just hardcode the strings

export default function MobileNav({ currentView, onNavigate }) {
  const navItems = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'my-inquiries', label: 'My Inquiries', icon: Truck },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'profile', label: 'Profile', icon: UserRound }
  ];

  return (
    <nav className="mobile-bottom-nav">
      {navItems.map((item) => {
        const isActive = currentView === item.id;
        return (
          <button
            key={item.id}
            className={`mobile-nav-item ${isActive ? 'active' : ''}`}
            onClick={() => onNavigate(item.id)}
            type="button"
          >
            <item.icon size={22} className="nav-icon" />
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
