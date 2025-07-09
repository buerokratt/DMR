const dmr_socket_connection_active = 'dmr_socket_connection_active';
const dmr_http_requests_total = 'dmr_http_requests_total';
const dmr_http_request_duration_seconds = 'dmr_http_request_duration_seconds';
const dmr_http_success_total = 'dmr_http_success_total';
const dmr_http_errors_total = 'dmr_http_errors_total';
const dmr_socket_connection_duration_seconds = 'dmr_socket_connection_duration_seconds';
const dmr_socket_errors_total = 'dmr_socket_errors_total';
const dmr_socket_events_received_total = 'dmr_socket_events_received_total';
const dmr_socket_events_sent_total = 'dmr_socket_events_sent_total';
const dmr_message_processing_duration_seconds = 'dmr_message_processing_duration_seconds';

export const Metrics = {
  dmrSocketConnectionActive: dmr_socket_connection_active,
  dmrSocketConnectionActiveHelp: dmr_socket_connection_active + '_help',
  dmrHttpRequestTotal: dmr_http_requests_total,
  dmrHttpRequestTotalHelp: dmr_http_requests_total + '_help',
  dmrHttpErrorsTotal: dmr_http_errors_total,
  dmrHttpErrorsTotalHelp: dmr_http_errors_total + '_help',
  dmrHttpSuccessTotal: dmr_http_success_total,
  dmrHttpSuccessTotalHelp: dmr_http_success_total + '_help',
  dmrHttpRequestDurationSeconds: dmr_http_request_duration_seconds,
  dmrHttpRequestDurationSecondsHelp: dmr_http_request_duration_seconds + '_help',
  dmrSocketConnectionDurationSeconds: dmr_socket_connection_duration_seconds,
  dmrSocketConnectionDurationSecondsHelp: dmr_socket_connection_duration_seconds + '_help',
  dmrSocketErrorsTotal: dmr_socket_errors_total,
  dmrSocketErrorsTotalHelp: dmr_socket_errors_total + '_help',
  dmrSocketEventsReceivedTotal: dmr_socket_events_received_total,
  dmrSocketEventsReceivedTotalHelp: dmr_socket_events_received_total + '_help',
  dmrSocketEventsSentTotal: dmr_socket_events_sent_total,
  dmrSocketEventsSentTotalHelp: dmr_socket_events_sent_total + '_help',
  dmrMessageProcessingDurationSeconds: dmr_message_processing_duration_seconds,
  dmrMessageProcessingDurationSecondsHelp: dmr_message_processing_duration_seconds + '_help',
} as const;
