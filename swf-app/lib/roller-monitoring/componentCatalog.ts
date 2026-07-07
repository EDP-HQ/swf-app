import {
    CUSTOM_COMPONENT_DEFAULT_LIMIT_HOURS,
    GEARBOX_DEFAULT_LIMIT_HOURS,
    SKIPPER_BEARING_DEFAULT_LIMIT_HOURS
} from './constants';
import type { MachineDashboard, MachineFixedPartKey } from './types';

export const COMPONENT_DEFAULT_COMPANY = 'KSB';
export const COMPONENT_DEFAULT_FACTORY = 'F002';

/** Dropdown value for registering a custom part name (bearing, etc.). */
export const ADD_PART_CUSTOM = '__custom__';

export type AddPartChoice = MachineFixedPartKey | typeof ADD_PART_CUSTOM;

export type ComponentPartOption = {
    key: MachineFixedPartKey;
    label: string;
    partSeq: number;
    partType: string;
    defaultLimitHours: number;
};

export const COMPONENT_PART_OPTIONS: ComponentPartOption[] = [
    {
        key: 'gearbox',
        label: 'Gearbox',
        partSeq: 1,
        partType: 'GEARBOX',
        defaultLimitHours: GEARBOX_DEFAULT_LIMIT_HOURS
    },
    {
        key: 'skipperFront',
        label: 'Skipper SF (front)',
        partSeq: 2,
        partType: 'SF',
        defaultLimitHours: SKIPPER_BEARING_DEFAULT_LIMIT_HOURS
    },
    {
        key: 'skipperBack',
        label: 'Skipper SB (back)',
        partSeq: 3,
        partType: 'SB',
        defaultLimitHours: SKIPPER_BEARING_DEFAULT_LIMIT_HOURS
    }
];

export function isComponentRegistered(machine: MachineDashboard, key: MachineFixedPartKey): boolean {
    return Boolean(machine[key].partId?.trim());
}

/** Parts not yet registered in TB_COMPONENTS_TRACKER for this machine. */
export function missingComponentOptions(machine: MachineDashboard): ComponentPartOption[] {
    return COMPONENT_PART_OPTIONS.filter((opt) => !isComponentRegistered(machine, opt.key));
}

export function componentOptionByKey(key: MachineFixedPartKey): ComponentPartOption | undefined {
    return COMPONENT_PART_OPTIONS.find((opt) => opt.key === key);
}

export function isCustomPartNameTaken(machine: MachineDashboard, name: string): boolean {
    const upper = name.trim().toUpperCase();
    if (!upper) return true;

    for (const opt of COMPONENT_PART_OPTIONS) {
        if (opt.partType === upper && isComponentRegistered(machine, opt.key)) return true;
    }

    return machine.extraParts.some((p) => (p.partType ?? '').toUpperCase() === upper);
}
