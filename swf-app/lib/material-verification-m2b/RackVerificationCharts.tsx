"use client";

import { Doughnut } from "react-chartjs-2";
import {
    buildRackDoughnutCharts,
    createRackDoughnutOptions,
    type DoughnutChartData
} from "./rackChartData";
import type { M2bVerificationRow } from "./fetchM2bVerification";

function ChartCard({ title, data }: { title: string; data: DoughnutChartData }) {
    const options = createRackDoughnutOptions();
    return (
        <div className="chart-card">
            <h4>{title}</h4>
            <div className="chart-wrapper">
                <Doughnut data={data} options={options} />
            </div>
        </div>
    );
}

export function RackVerificationCharts({
    rackData,
    rackType
}: {
    rackData: M2bVerificationRow[];
    rackType: string;
}) {
    const charts = buildRackDoughnutCharts(rackData, rackType);
    return (
        <div className="charts-section">
            <ChartCard title="Bin Location" data={charts.locationChart} />
            <ChartCard title="Bin Cell" data={charts.cellChart} />
            <ChartCard title="Length Status" data={charts.flag1Chart} />
            <ChartCard title="Item Status" data={charts.flag2Chart} />
        </div>
    );
}
