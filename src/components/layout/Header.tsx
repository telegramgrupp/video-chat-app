import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Video, User, LogOut, Store } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

export const Header: React.FC = () => {
  const navigate = useNavigate();
  const { user, setUser } = useAuth();
  const [showStore, setShowStore] = useState(false);

  const handleLogout = () => {
    setUser(null);
    navigate('/');
  };

  const handleStorePurchase = (coins: number, price: string) => {
    console.log(`Purchase attempted: ${coins} coins for ${price}`);
    setShowStore(false);
  };

  return (
    <>
      <header className="absolute left-0 right-0 top-0 z-50 bg-transparent">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex items-center space-x-2">
            <Video className="h-6 w-6 text-white" />
            <span className="text-xl font-semibold text-white">VideoConnect</span>
          </Link>
          {user && (
            <nav className="flex items-center space-x-2">
              <button
                onClick={() => setShowStore(true)}
                className="flex items-center space-x-1 rounded-lg bg-white/10 px-3 py-2 text-sm text-white backdrop-blur-sm transition-all hover:bg-white/20"
              >
                <Store className="h-4 w-4" />
                <span>Store</span>
              </button>
              <Link
                to="/profile"
                className="flex items-center space-x-1 rounded-lg bg-white/10 px-3 py-2 text-sm text-white backdrop-blur-sm transition-all hover:bg-white/20"
              >
                <User className="h-4 w-4" />
                <span>Profile</span>
              </Link>
              <button
                onClick={handleLogout}
                className="flex items-center space-x-1 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400 backdrop-blur-sm transition-all hover:bg-red-500/20"
              >
                <LogOut className="h-4 w-4" />
                <span>Sign Out</span>
              </button>
            </nav>
          )}
        </div>
      </header>

      {/* Store Modal */}
      {showStore && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-8">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-2xl font-semibold">Get Coins</h2>
              <button
                onClick={() => setShowStore(false)}
                className="rounded-full p-2 text-gray-500 hover:bg-gray-100"
              >
                <LogOut className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4">
              {[
                { coins: 100, price: '$1.99' },
                { coins: 500, price: '$6.99' },
                { coins: 1000, price: '$12.99' },
                { coins: 2500, price: '$24.99' },
              ].map(({ coins, price }) => (
                <button
                  key={coins}
                  onClick={() => handleStorePurchase(coins, price)}
                  className="flex w-full items-center justify-between rounded-lg border border-gray-200 p-4 hover:bg-gray-50"
                >
                  <span className="flex items-center">
                    <Store className="mr-2 h-5 w-5 text-indigo-600" />
                    {coins} Coins
                  </span>
                  <span className="font-semibold text-gray-900">{price}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
};