import { Metadata } from 'next';
import Layout from '../../layout/layout';

interface AppLayoutProps {
    children: React.ReactNode;
}

export const metadata: Metadata = {
    title: 'Kiswire SWF',
    description: 'Kiswire SWF — warehouse, ESL, bobbin, and related tools',
    robots: { index: false, follow: false },
    viewport: { initialScale: 1, width: 'device-width' },
    icons: {
        icon: [{ url: '/favicon.ico?v=esl-app', type: 'image/x-icon', sizes: 'any' }]
    }
};

export default function AppLayout({ children }: AppLayoutProps) {
    return <Layout>{children}</Layout>;
}
