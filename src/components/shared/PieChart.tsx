import React, { useMemo } from 'react';

interface PieChartData {
    label: string;
    value: number;
    color: string;
}

interface PieChartProps {
    data: PieChartData[];
    size?: number;
    showLegend?: boolean;
    donut?: boolean;
    /** Big label in the donut center. Defaults to the summed total. */
    centerLabel?: string | number;
    /** Small caption under the center label. */
    centerCaption?: string;
}

/**
 * SVG-based pie/donut chart with animated segments and optional legend.
 */
export const PieChart: React.FC<PieChartProps> = ({
    data,
    size = 160,
    showLegend = true,
    donut = true,
    centerLabel,
    centerCaption,
}) => {
    const total = useMemo(() => data.reduce((sum, d) => sum + d.value, 0), [data]);

    const radius = size / 2 - 4;
    const strokeWidth = donut ? radius * 0.35 : radius;
    const normalizedRadius = donut ? radius - strokeWidth / 2 : radius / 2;
    const circumference = 2 * Math.PI * normalizedRadius;
    const center = size / 2;

    const segments = useMemo(() => {
        let accumulated = 0;
        return data
            .filter((d) => d.value > 0)
            .map((d) => {
                const pct = total > 0 ? d.value / total : 0;
                const dashArray = circumference * pct;
                const dashOffset = -circumference * accumulated;
                accumulated += pct;
                return { ...d, pct, dashArray, dashOffset };
            });
    }, [data, total, circumference]);

    if (total === 0) {
        return (
            <div className="zenith-pie-chart zenith-pie-chart--empty">
                <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                    <circle
                        cx={center}
                        cy={center}
                        r={normalizedRadius}
                        fill="none"
                        stroke="var(--zenith-border)"
                        strokeWidth={strokeWidth}
                    />
                </svg>
                {showLegend && <p className="zenith-pie-chart__empty-text">No data</p>}
            </div>
        );
    }

    return (
        <div className="zenith-pie-chart">
            <svg
                width={size}
                height={size}
                viewBox={`0 0 ${size} ${size}`}
                className="zenith-pie-chart__svg"
            >
                {segments.map((seg, i) => (
                    <circle
                        key={seg.label}
                        className="zenith-pie-chart__segment"
                        cx={center}
                        cy={center}
                        r={normalizedRadius}
                        fill="none"
                        stroke={seg.color}
                        strokeWidth={strokeWidth}
                        strokeDasharray={`${seg.dashArray} ${circumference - seg.dashArray}`}
                        strokeDashoffset={seg.dashOffset}
                        transform={`rotate(-90 ${center} ${center})`}
                        style={{
                            animationDelay: `${i * 120}ms`,
                        }}
                    />
                ))}
                {donut && (
                    <text
                        x={center}
                        y={centerCaption ? center - size * 0.05 : center}
                        textAnchor="middle"
                        dominantBaseline="central"
                        className="zenith-pie-chart__total"
                        fill="var(--zenith-text-normal)"
                        fontSize={size * 0.16}
                        fontWeight={700}
                    >
                        {centerLabel ?? total}
                    </text>
                )}
                {donut && centerCaption && (
                    <text
                        x={center}
                        y={center + size * 0.09}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fill="var(--zenith-text-muted)"
                        fontSize={size * 0.075}
                        style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}
                    >
                        {centerCaption}
                    </text>
                )}
            </svg>

            {showLegend && (
                <div className="zenith-pie-chart__legend">
                    {segments.map((seg) => (
                        <div key={seg.label} className="zenith-pie-chart__legend-item">
                            <span
                                className="zenith-pie-chart__legend-dot"
                                style={{ backgroundColor: seg.color }}
                            />
                            <span className="zenith-pie-chart__legend-label">{seg.label}</span>
                            <span className="zenith-pie-chart__legend-value">
                                {seg.value} ({Math.round(seg.pct * 100)}%)
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
