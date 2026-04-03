import React from 'react';
import Navbar from '../components/Navbar';
import { motion } from 'motion/react';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col font-sans" style={{ backgroundColor: 'var(--color-brand-bg)', color: 'var(--color-brand-text)' }}>
      <Navbar />
      <motion.main
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex-grow container mx-auto px-4 py-8 max-w-7xl"
      >
        {children}
      </motion.main>
      <footer className="border-t py-8 mt-auto" style={{ backgroundColor: 'var(--color-brand-surface)', borderColor: 'var(--color-brand-border)' }}>
        <div className="max-w-7xl mx-auto px-4 text-center text-sm" style={{ color: 'var(--color-brand-faint)' }}>
          <p>&copy; 2026 LikeTalent — Centro de Talento y Habilidades.</p>
        </div>
      </footer>
    </div>
  );
}
