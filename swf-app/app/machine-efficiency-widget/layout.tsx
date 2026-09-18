import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
    title: 'Machine Efficiency',
    robots: { index: false, follow: false }
};

export default function MachineEfficiencyWidgetLayout({ children }: { children: ReactNode }) {
    return <div className="mew-root">{children}</div>;
}
