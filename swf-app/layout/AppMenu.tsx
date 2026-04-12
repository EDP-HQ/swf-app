/* eslint-disable @next/next/no-img-element */

import React, { useMemo } from 'react';
import AppMenuitem from './AppMenuitem';
import { MenuProvider } from './context/menucontext';
import { APP_NAV_SECTIONS } from '@/lib/appNavigation';

const AppMenu = () => {
    const fullMenu = useMemo(
        () => [
            {
                label: 'Home',
                items: [{ label: 'Home', icon: 'pi pi-fw pi-home', to: '/' }]
            },
            ...APP_NAV_SECTIONS.map((section) => ({
                label: section.label,
                items: section.items.map(({ label, to, icon }) => ({ label, to, icon }))
            }))
        ],
        []
    );

    return (
        <MenuProvider>
            <ul className="layout-menu">
                {fullMenu.map((item, i) =>
                    item.items.length > 0 ? (
                        <React.Fragment key={item.label}>
                            <AppMenuitem item={item} root={true} index={i} />
                            {i < fullMenu.length - 1 && <li className="menu-separator"></li>}
                        </React.Fragment>
                    ) : null
                )}
            </ul>
        </MenuProvider>
    );
};

export default AppMenu;
