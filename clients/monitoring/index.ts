import { IMonitoring } from '../../models/monitoring';
import httpClient from '../../utils/network/http';
import FormData from 'form-data';
import routes from '../routes';
import { DailyUptimeRatioConverter } from './series';

export interface IMonitorLog {
  id?: number;
  type?: number;
  datetime: number; // timestamp in seconds
  duration: number;
  reason?: {
    code: string;
    detail: string;
  };
}

interface IUptimeRobotMonitor {
  id: number;
  friendly_name: string;
  create_datetime: number;
  status: number;
  logs: IMonitorLog[];
  all_time_uptime_ratio: string;
  custom_uptime_ratio: string;
  custom_down_durations: string;
}

interface IUptimeRobotResponse {
  stat: 'ok' | 'fail';
  pagination: {
    offset: number;
    limit: number;
    total: number;
  };
  monitors: IUptimeRobotMonitor[];
}

export const fetchMonitorings = async (
  monitoringIds: number[]
): Promise<IMonitoring[]> => {
  const data = new FormData();
  const to = new Date();
  const from = new Date();
  from.setUTCDate(to.getUTCDate() - 89);
  from.setUTCHours(0);
  from.setUTCMinutes(0);
  from.setUTCSeconds(0);

  data.append('monitors', monitoringIds.join('-'));
  data.append('logs', '1');
  data.append('format', 'json');
  data.append('custom_uptime_ratios', '1-7-30-90');
  data.append('log_types', '1');
  data.append('logs_end_date', Math.ceil(to.getTime() / 1000));
  data.append('logs_start_date', Math.floor(from.getTime() / 1000));

  const response = await httpClient({
    url: routes.monitoring + `?api_key=${process.env.UPTIME_ROBOT_API_KEY}`,
    method: 'POST',
    data,
    headers: data.getHeaders(),
  });

  const result = response.data as IUptimeRobotResponse;

  return result.monitors.map((monitor) => mapToDomainObject(monitor, from));
};

export const fetchMonitoring = async (
  monitoringId: number
): Promise<IMonitoring> => {
  const monitoring = await fetchMonitorings([monitoringId]);
  return monitoring[0];
};

const mapToDomainObject = (
  monitor: IUptimeRobotMonitor,
  from: Date
): IMonitoring => {
  const createdAt = new Date(monitor.create_datetime * 1000);
  const dailySeries = new DailyUptimeRatioConverter(from, createdAt);
  dailySeries.feed(monitor.logs);

  const uptimeAvg = monitor.custom_uptime_ratio.split('-');
  const isOnline = [8, 9].indexOf(monitor.status) === -1;

  return {
    id: monitor.id,
    series: dailySeries.export(),
    isOnline,
    uptime: {
      day: uptimeAvg[0],
      week: uptimeAvg[1],
      month: uptimeAvg[2],
      trimester: uptimeAvg[3],
    },
  };
};
