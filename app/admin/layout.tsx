import './dark.css';
import './admin.css';

const SCRIPT_TEMA = `
try {
  var temaSalvo = localStorage.getItem('cf_admin_theme');
  var tema = temaSalvo === 'dark' || temaSalvo === 'light'
    ? temaSalvo
    : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.dataset.adminTheme = tema;
} catch (_) {
  document.documentElement.dataset.adminTheme = 'light';
}
`;

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
      {children}
    </>
  );
}
