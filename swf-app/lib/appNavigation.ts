/**
 * Shared navigation: sidebar menu and home hub tiles stay in sync.
 */

export type AppNavItem = {
    label: string;
    to: string;
    icon: string;
    /** Short blurb for the home hub card */
    description: string;
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
                to: '/WareHouse/material-verification',
                icon: 'pi pi-fw pi-check-square',
                description: 'Verification dashboard and rack detail views.'
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
                label: 'Bobbin monitoring',
                to: '/bobbin-monitoring',
                icon: 'pi pi-fw pi-sync',
                description: 'PDA login, cycle checks, scrap, and limits.'
            }
        ]
    }
];
