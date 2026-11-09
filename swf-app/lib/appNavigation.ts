/**
 * Shared navigation: sidebar menu and home hub tiles stay in sync.
 */

export type AppNavItem = {
    label: string;
    to: string;
    icon: string;
    /** Short blurb for the home hub card */
    description: string;
    /** When true, route stays live but is omitted from menu and home hub */
    hidden?: boolean;
};

export type AppNavSection = {
    label: string;
    items: AppNavItem[];
};

export const APP_NAV_SECTIONS: AppNavSection[] = [
    {
        label: 'Warehouse',
        items: [
            {
                label: 'Rack monitoring',
                to: '/WareHouse/rack-monitoring',
                icon: 'pi pi-fw pi-chart-line',
                description: 'Rack utilization, real-time status, and exports.'
            },
            {
                label: 'Material verification',
                to: '/WareHouse/material-verification-m2b',
                icon: 'pi pi-fw pi-check-square',
                description: 'Rack verification: bin TARGET, material-list rules, and rack detail views.'
            },
            {
                label: 'Material verification (classic)',
                to: '/WareHouse/material-verification',
                icon: 'pi pi-fw pi-check-square',
                description: 'Legacy KBAS090 screen (bin REF_MATERIAL).',
                hidden: true
            }
        ]
    },
    {
        label: 'ESL tag',
        items: [
            {
                label: 'D1 rack',
                to: '/esltag/esltagd1',
                icon: 'pi pi-fw pi-table',
                description: 'D1 bin search, open/close, and PNG capture.'
            },
            {
                label: 'Open / close',
                to: '/esltag/esltagd2',
                icon: 'pi pi-fw pi-lock-open',
                description: 'Open search, inventory, and binding flows.'
            }
        ]
    },
    {
        label: 'Bobbin',
        items: [
            {
                label: 'Bobbin Lifespan Control Program',
                to: '/bobbin-monitoring',
                icon: 'pi pi-fw pi-hourglass',
                description: 'PDA login, bobbin cycle and lifespan checks, and limits.'
            }
        ]
    },
    {
        label: 'Parts',
        items: [
            {
                label: 'Component monitoring',
                to: '/parts-board',
                icon: 'pi pi-fw pi-th-large',
                description: 'Machines, rollers, components — dashboard with alerts and edit.'
            }
        ]
    },
    {
        label: 'Production',
        items: [
            {
                label: 'Machine Efficiency',
                to: '/machine-efficiency',
                icon: 'pi pi-fw pi-chart-bar',
                description: 'Drawing & Stranding PE, changeover, and abnormal bobbin overview.'
            }
        ]
    }
];

/** Menu / home hub entries (excludes `hidden` items). */
export function getVisibleNavSections(): AppNavSection[] {
    return APP_NAV_SECTIONS.map((section) => ({
        ...section,
        items: section.items.filter((item) => !item.hidden)
    }));
}
