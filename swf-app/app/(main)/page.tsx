'use client';

import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Card } from 'primereact/card';
import { APP_NAV_SECTIONS } from '@/lib/appNavigation';

const HOME_BRAND_ICON = '/favicon.ico?v=esl-app';

export default function HomeHubPage() {
    return (
        <div className="grid">
            <div className="col-12">
                <div className="card mb-4">
                    <div className="flex align-items-center gap-3 flex-wrap">
                        <Image
                            src={HOME_BRAND_ICON}
                            alt=""
                            width={40}
                            height={40}
                            className="border-round"
                            unoptimized
                            priority
                        />
                        <h2 className="m-0 text-2xl font-semibold">Kiswire SWF</h2>
                    </div>
                </div>
            </div>
            {APP_NAV_SECTIONS.map((section) => (
                <div key={section.label} className="col-12">
                    <h3 className="text-lg font-semibold mt-0 mb-3 text-color-secondary">{section.label}</h3>
                    <div className="grid">
                        {section.items.map((item) => (
                            <div key={item.to} className="col-12 md:col-6 lg:col-4">
                                <Link
                                    href={item.to}
                                    prefetch
                                    className="text-color"
                                    style={{ textDecoration: 'none', color: 'inherit' }}
                                >
                                    <Card className="h-full shadow-2 hover:shadow-4 transition-all transition-duration-200 cursor-pointer surface-card">
                                        <div className="flex align-items-start gap-3">
                                            <span
                                                className={`${item.icon} text-3xl text-primary`}
                                                aria-hidden
                                            />
                                            <div className="flex flex-column gap-2 flex-1 min-w-0">
                                                <span className="text-xl font-semibold line-height-3">{item.label}</span>
                                                <span className="text-sm text-color-secondary line-height-3 m-0">
                                                    {item.description}
                                                </span>
                                                <span className="text-sm text-primary font-medium mt-1">
                                                    Open →
                                                </span>
                                            </div>
                                        </div>
                                    </Card>
                                </Link>
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}
