import type { RouteObject } from 'react-router-dom';
import NotFound from '@/pages/NotFound';
import LoginPage from '@/pages/login/page';
import Home from '@/pages/home/page';
import AreasPage from '@/pages/areas/page';
import DistribucionPage from '@/pages/distribucion/page';
import InversionPage from '@/pages/inversion/page';
import CostosPage from '@/pages/costos/page';
import CostosEmbedPage from '@/pages/costos/embed-page';
import CotizacionesPage from '@/pages/cotizaciones/page';
import ManoObraPage from '@/pages/mano-obra/page';
import GastosVariosPage from '@/pages/gastos-varios/page';
import VolumenesPage from '@/pages/volumenes/page';
import ConfiguracionPage from '@/pages/configuracion/page';
import ProtectedRoute from '@/components/feature/ProtectedRoute';

const routes: RouteObject[] = [
  { path: '/login', element: <LoginPage /> },
  { path: '/costos-embed', element: <CostosEmbedPage /> },
  { path: '/', element: <ProtectedRoute moduleKey="dashboard"><Home /></ProtectedRoute> },
  { path: '/areas', element: <ProtectedRoute moduleKey="areas"><AreasPage /></ProtectedRoute> },
  { path: '/distribucion', element: <ProtectedRoute moduleKey="distribucion"><DistribucionPage /></ProtectedRoute> },
  { path: '/inversion', element: <ProtectedRoute moduleKey="inversion"><InversionPage /></ProtectedRoute> },
  { path: '/costos', element: <ProtectedRoute moduleKey="costos"><CostosPage /></ProtectedRoute> },
  { path: '/cotizaciones', element: <ProtectedRoute moduleKey="costos"><CotizacionesPage /></ProtectedRoute> },
  { path: '/mano-obra', element: <ProtectedRoute moduleKey="mano-obra"><ManoObraPage /></ProtectedRoute> },
  { path: '/gastos-varios', element: <ProtectedRoute moduleKey="gastos-varios"><GastosVariosPage /></ProtectedRoute> },
  { path: '/volumenes', element: <ProtectedRoute moduleKey="volumenes"><VolumenesPage /></ProtectedRoute> },
  { path: '/configuracion', element: <ProtectedRoute moduleKey="configuracion"><ConfiguracionPage /></ProtectedRoute> },
  { path: '*', element: <NotFound /> },
];

export default routes;
