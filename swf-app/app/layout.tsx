'use client';
import { LayoutProvider } from '../layout/context/layoutcontext';
import { PrimeReactProvider } from 'primereact/api';
import 'primereact/resources/primereact.css';
import 'primeflex/primeflex.css';
import 'primeicons/primeicons.css';
import '../styles/layout.scss';
import '../styles/demo/Demos.scss';

interface RootLayoutProps {
    children: React.ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
    return (
        <html lang="en" suppressHydrationWarning>
            <head>
                {/* Same asset as esl-app/app/favicon.ico — query busts browser / CDN cache of old icon */}
                <link rel="icon" href="/favicon.ico?v=esl-app" type="image/x-icon" sizes="any" />
                <link rel="shortcut icon" href="/favicon.ico?v=esl-app" type="image/x-icon" />
                <link id="theme-css" href="/lara-light-indigo/theme.css" rel="stylesheet"></link>
            </head>
            <body>
                <PrimeReactProvider>
                    <LayoutProvider>{children}</LayoutProvider>
                </PrimeReactProvider>
            </body>
        </html>
    );
}
