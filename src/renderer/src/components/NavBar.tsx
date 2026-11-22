import { useEffect, useState } from 'react';
import { MoonIcon, SunIcon } from '@heroicons/react/24/solid';

export const NavBar = () => {
  const [dark, setDark] = useState<boolean>(false);

  useEffect(() => {
    const root = document.documentElement;
    if (dark) root.classList.add('dark');
    else root.classList.remove('dark');
  }, [dark]);

  return (
    <header className="bg-white dark:bg-gray-900 shadow-md py-4 px-6 flex justify-between items-center">
      <h1 className="text-2xl font-semibold text-gray-800 dark:text-gray-100">OdisseyMC Launcher</h1>
      <button
        onClick={() => setDark(!dark)}
        className="p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition"
        aria-label="Toggle dark mode"
      >
        {dark ? (
          <SunIcon className="h-6 w-6 text-yellow-400" />
        ) : (
          <MoonIcon className="h-6 w-6 text-gray-600" />
        )}
      </button>
    </header>
  );
};
