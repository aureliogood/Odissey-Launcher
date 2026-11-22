// Navigation definitions shared between components
export type View =
  | 'play'
  | 'versions'
  | 'accounts'
  | 'mods'
  | 'textures'
  | 'optimizer'
  | 'diagnostics'
  | 'screenshots'
  | 'settings';

export const viewTitles: Record<View, { title: string; subtitle: string }> = {
  play: { title: 'Jugar', subtitle: 'ODISSEY CLIENT  /  MINECRAFT JAVA' },
  versions: { title: 'Versiones', subtitle: 'VERSIONES DE MINECRAFT Y PERFILES' },
  accounts: { title: 'Cuentas', subtitle: 'CUENTAS Y SESIONES' },
  mods: { title: 'Mods', subtitle: 'BIBLIOTECA DE MODS' },
  textures: { title: 'Texturas', subtitle: 'PAQUETES DE RECURSOS' },
  optimizer: { title: 'Optimizador', subtitle: 'RENDIMIENTO DEL JUEGO' },
  diagnostics: { title: 'Registro Minecraft', subtitle: 'REGISTROS Y DIAGNÓSTICOS' },
  screenshots: { title: 'Capturas', subtitle: 'CAPTURAS DE MINECRAFT' },
  settings: { title: 'Ajustes', subtitle: 'PREFERENCIAS DEL LAUNCHER' },
};

export const navItems: Array<{ view: View; label: string; icon: string }> = [
  { view: 'play', label: 'Jugar', icon: 'play' },
  { view: 'versions', label: 'Versiones', icon: 'versions' },
  { view: 'accounts', label: 'Cuentas', icon: 'users' },
  { view: 'mods', label: 'Mods', icon: 'puzzle' },
  { view: 'textures', label: 'Texturas', icon: 'image' },
  { view: 'optimizer', label: 'Optimizador', icon: 'sparkles' },
  { view: 'diagnostics', label: 'Registro', icon: 'terminal' },
  { view: 'screenshots', label: 'Capturas', icon: 'image' },
  { view: 'settings', label: 'Ajustes', icon: 'settings' },
];
