import { 
  Flame, Users, Heart, Home, 
  BookOpen, Music, Activity, HeartHandshake, Library 
} from 'lucide-react';

// Import all 9 specialized enterprise modules
import MandirPujaDesk from '../components/MandirPujaDesk';
import SanghaKaryakartaDesk from '../components/SanghaKaryakartaDesk';
import GoshalaDesk from '../components/GoshalaDesk';
import AshramKutirDesk from '../components/AshramKutirDesk';
import GurukulDesk from '../components/GurukulDesk';
import SatsangDesk from '../components/SatsangDesk';
import YogaKendraDesk from '../components/YogaKendraDesk';
import SevaTrustDesk from '../components/SevaTrustDesk';
import VidyalayaDesk from '../components/VidyalayaDesk'; // ✨ NEW 9TH MODULE

export const WORKSPACE_PLUGINS = {
  Mandir: {
    id: 'MANDIR_PLUGIN',
    navTitle: 'Puja & Seva Desk',
    icon: Flame,
    component: MandirPujaDesk,
    accent: 'text-amber-600',
    bg: 'bg-amber-50',
    border: 'border-amber-200'
  },
  Sangha: {
    id: 'SANGHA_PLUGIN',
    navTitle: 'Karyakarta Network',
    icon: Users,
    component: SanghaKaryakartaDesk,
    accent: 'text-orange-600',
    bg: 'bg-orange-50',
    border: 'border-orange-200'
  },
  Goshala: {
    id: 'GOSHALA_PLUGIN',
    navTitle: 'Gomata Registry',
    icon: Heart,
    component: GoshalaDesk,
    accent: 'text-rose-600',
    bg: 'bg-rose-50',
    border: 'border-rose-200'
  },
  Ashram: {
    id: 'ASHRAM_PLUGIN',
    navTitle: 'Kutir Booking',
    icon: Home,
    component: AshramKutirDesk,
    accent: 'text-emerald-600',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200'
  },
  Gurukul: {
    id: 'GURUKUL_PLUGIN',
    navTitle: 'Vidyarthi Desk',
    icon: BookOpen,
    component: GurukulDesk,
    accent: 'text-yellow-600',
    bg: 'bg-yellow-50',
    border: 'border-yellow-200'
  },
  Satsang: {
    id: 'SATSANG_PLUGIN',
    navTitle: 'Pravachan Vault',
    icon: Music,
    component: SatsangDesk,
    accent: 'text-cyan-600',
    bg: 'bg-cyan-50',
    border: 'border-cyan-200'
  },
  Yoga: {
    id: 'YOGA_PLUGIN',
    navTitle: 'Wellness CRM',
    icon: Activity,
    component: YogaKendraDesk,
    accent: 'text-teal-600',
    bg: 'bg-teal-50',
    border: 'border-teal-200'
  },
  Trust: {
    id: 'TRUST_PLUGIN',
    navTitle: 'Seva Campaigns',
    icon: HeartHandshake,
    component: SevaTrustDesk,
    accent: 'text-indigo-600',
    bg: 'bg-indigo-50',
    border: 'border-indigo-200'
  },
  // ✨ NEW 9TH ORGANIZATION TYPE
  Vidyalaya: {
    id: 'VIDYALAYA_PLUGIN',
    navTitle: 'Shiksha Desk',
    icon: Library,
    component: VidyalayaDesk,
    accent: 'text-sky-600',
    bg: 'bg-sky-50',
    border: 'border-sky-200'
  }
};

export const getAvailableWorkspaces = () => Object.keys(WORKSPACE_PLUGINS);

export const resolveWorkspacePlugin = (type) => {
  if (!type) return WORKSPACE_PLUGINS['Mandir'];
  const normalizedType = String(type).charAt(0).toUpperCase() + String(type).slice(1).toLowerCase();
  return WORKSPACE_PLUGINS[normalizedType] || WORKSPACE_PLUGINS['Mandir'];
};