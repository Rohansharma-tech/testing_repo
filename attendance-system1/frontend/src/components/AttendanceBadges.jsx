import {
  getReasonClasses,
  getReasonLabel,
  getStatusClasses,
  getStatusLabel,
} from "../utils/attendance";

export function AttendanceStatusBadge({ status }) {
  if (!status) {
    return null;
  }

  return <span className={getStatusClasses(status)}>{getStatusLabel(status)}</span>;
}

export function AttendanceReasonBadge({ reason }) {
  if (!reason) {
    return null;
  }

  return <span className={getReasonClasses(reason)}>{getReasonLabel(reason)}</span>;
}
