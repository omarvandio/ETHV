import { Link, useNavigate } from 'react-router-dom';
import { useWallet } from '../hooks/useWallet';
import { useAuth } from '../store/AuthContext';
import { LogOut, LayoutDashboard, FileUp, CheckCircle, Briefcase, Menu, X, Globe } from 'lucide-react';
import { useState } from 'react';
import { cn } from '../utils/cn';

export default function Navbar() {
  const { address, isConnected, logout } = useWallet()
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const navItems = [
    { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard, protected: true },
    { name: 'Upload CV', path: '/upload', icon: FileUp, protected: true },
    { name: 'LinkedIn', path: '/linkedin', icon: Globe, protected: true },
    { name: 'Validation', path: '/validation', icon: CheckCircle, protected: true },
    { name: 'Opportunities', path: '/opportunities', icon: Briefcase, protected: true },
  ];

  return (
    <nav className="bg-zinc-950 border-b border-zinc-800 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center">
            <Link to="/" className="flex-shrink-0 flex items-center gap-2">
              <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center font-bold text-black">E</div>
              <span className="text-white font-bold text-xl tracking-tight">ETHV</span>
            </Link>
            <div className="hidden md:block ml-10">
              <div className="flex items-baseline space-x-4">
                {navItems.map((item) => (
                  (!item.protected || isAuthenticated) && (
                    <Link
                      key={item.name}
                      to={item.path}
                      className="text-zinc-400 hover:text-white px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2"
                    >
                      <item.icon size={16} />
                      {item.name}
                    </Link>
                  )
                ))}
              </div>
            </div>
          </div>
          <div className="hidden md:block">
            <div className="ml-4 flex items-center md:ml-6 gap-4">
              {isConnected && address ? (
                <div className="flex items-center gap-4">
                  <div className="bg-zinc-900 border border-zinc-800 px-3 py-1.5 rounded-full text-zinc-300 text-xs font-mono">
                    {address.slice(0, 6)}...{address.slice(-4)}
                  </div>
                  <button
                    onClick={handleLogout}
                    className="text-zinc-400 hover:text-white transition-colors"
                  >
                    <LogOut size={20} />
                  </button>
                </div>
              ) : (
                /* @ts-ignore */
                <w3m-button />
              )}
            </div>
          </div>
          <div className="-mr-2 flex md:hidden">
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="inline-flex items-center justify-center p-2 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-900 focus:outline-none"
            >
              {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      <div className={cn("md:hidden", isMenuOpen ? "block" : "hidden")}>
        <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3 bg-zinc-950 border-b border-zinc-800">
          {navItems.map((item) => (
            (!item.protected || isAuthenticated) && (
              <Link
                key={item.name}
                to={item.path}
                className="text-zinc-400 hover:text-white block px-3 py-2 rounded-md text-base font-medium flex items-center gap-2"
                onClick={() => setIsMenuOpen(false)}
              >
                <item.icon size={18} />
                {item.name}
              </Link>
            )
          ))}
          <div className="pt-4 pb-2 border-t border-zinc-800">
            {isConnected ? (
              <div className="flex items-center justify-between px-3">
                <span className="text-zinc-400 text-sm font-mono">{address?.slice(0, 6)}...{address?.slice(-4)}</span>
                <button onClick={handleLogout} className="text-zinc-400 hover:text-white">
                  <LogOut size={20} />
                </button>
              </div>
            ) : (
              <div className="px-3">
                {/* @ts-ignore */}
                <w3m-button />
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
