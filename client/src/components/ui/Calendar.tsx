import React from 'react';
import { ChevronLeft, ChevronRight, ChevronUp, ChevronDown } from 'lucide-react';
import { DayPicker } from 'react-day-picker';
import { zhCN } from 'date-fns/locale';
import './Calendar.css';

/**
 * Calendar — 日期选择日历（react-day-picker，复盘页日期选择器用）
 * 样式为项目 Aurora Glass token 体系（无 tailwind），交互语义参照 shadcn 版：
 * 单日选择、非本月淡化、今日圆点标记、hover 玻璃底、选中主色实底。
 */
export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function ChevronIcon(props: { orientation?: 'left' | 'right' | 'up' | 'down' }) {
  if (props.orientation === 'left') {
    return <ChevronLeft size={16} strokeWidth={2} aria-hidden="true" />;
  }
  if (props.orientation === 'up') {
    return <ChevronUp size={16} strokeWidth={2} aria-hidden="true" />;
  }
  if (props.orientation === 'down') {
    return <ChevronDown size={16} strokeWidth={2} aria-hidden="true" />;
  }
  return <ChevronRight size={16} strokeWidth={2} aria-hidden="true" />;
}

export function Calendar({ className, showOutsideDays = false, locale = zhCN, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      locale={locale}
      className={className}
      classNames={{
        months: 'rdp-months',
        month: 'rdp-month',
        month_caption: 'rdp-month-caption',
        caption_label: 'rdp-caption-label',
        nav: 'rdp-nav',
        button_previous: 'rdp-nav-button',
        button_next: 'rdp-nav-button',
        weekday: 'rdp-weekday',
        day_button: 'rdp-day-button',
        day: 'rdp-day',
        today: 'rdp-today',
        outside: 'rdp-outside',
        hidden: 'rdp-hidden',
      }}
      components={{ Chevron: ChevronIcon }}
      {...props}
    />
  );
}

Calendar.displayName = 'Calendar';
