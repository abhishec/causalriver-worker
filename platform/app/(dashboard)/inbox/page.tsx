/**
 * Notification Inbox UI
 * 
 * In-app inbox for brain discoveries, alerts, and SE-aaS results
 */

'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

interface Notification {
  id: string;
  title: string;
  message: string;
  notification_type: string;
  read: boolean;
  created_at: string;
  metadata?: Record<string, unknown>;
}

export default function InboxPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread'>('unread');

  useEffect(() => {
    loadNotifications();
    
    // Real-time subscription
    const supabase = createClient();
    const channel = supabase
      .channel('notifications')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'notifications',
      }, () => {
        loadNotifications();
      })
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [filter]);

  async function loadNotifications() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    let query = supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (filter === 'unread') {
      query = query.eq('read', false);
    }

    const { data, error } = await query;
    if (!error && data) {
      setNotifications(data);
    }
    setLoading(false);
  }

  async function markAsRead(id: string) {
    const supabase = createClient();
    await supabase
      .from('notifications')
      .update({ read: true, read_at: new Date().toISOString() })
      .eq('id', id);
    loadNotifications();
  }

  async function markAllAsRead() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from('notifications')
      .update({ read: true, read_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .eq('read', false);
    loadNotifications();
  }

  if (loading) {
    return <div className="p-8">Loading notifications...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Inbox</h1>
        <div className="flex gap-4">
          <button
            onClick={() => setFilter(filter === 'all' ? 'unread' : 'all')}
            className="px-4 py-2 bg-gray-100 rounded hover:bg-gray-200"
          >
            {filter === 'all' ? 'Show Unread' : 'Show All'}
          </button>
          {notifications.some(n => !n.read) && (
            <button
              onClick={markAllAsRead}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Mark All Read
            </button>
          )}
        </div>
      </div>

      {notifications.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          No {filter === 'unread' ? 'unread ' : ''}notifications
        </div>
      ) : (
        <div className="space-y-4">
          {notifications.map((notification) => (
            <div
              key={notification.id}
              className={`p-4 border rounded-lg ${
                notification.read ? 'bg-white' : 'bg-blue-50 border-blue-200'
              }`}
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    {!notification.read && (
                      <span className="w-2 h-2 bg-blue-600 rounded-full"></span>
                    )}
                    <h3 className="font-semibold">{notification.title}</h3>
                  </div>
                  <p className="text-gray-700 mt-2">{notification.message}</p>
                  <p className="text-sm text-gray-500 mt-2">
                    {new Date(notification.created_at).toLocaleString()}
                  </p>
                </div>
                {!notification.read && (
                  <button
                    onClick={() => markAsRead(notification.id)}
                    className="text-sm text-blue-600 hover:underline ml-4"
                  >
                    Mark as read
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
