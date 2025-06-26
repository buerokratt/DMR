const dmr_socket_connections_active = 'dmr_socket_connections_active';
const dmr_socket_connections_total = 'dmr_socket_connections_total';
const dmr_socket_disconnections_total = 'dmr_socket_disconnections_total';
const dmr_socket_connection_duration_seconds = 'dmr_socket_connection_duration_seconds';
const dmr_socket_errors_total = 'dmr_socket_errors_total';
const dmr_socket_events_received_total = 'dmr_socket_events_received_total';
const dmr_socket_events_sent_total = 'dmr_socket_events_sent_total';
const dmr_message_processing_duration_seconds = 'dmr_message_processing_duration_seconds';

export const Metrics = {
  dmrSocketConnectionsActive: dmr_socket_connections_active,
  dmrSocketConnectionsActiveHelp: dmr_socket_connections_active + '_help',
  dmrSocketConnectionsTotal: dmr_socket_connections_total,
  dmrSocketConnectionsTotalHelp: dmr_socket_connections_total + '_help',
  dmrSocketDisconnectionsTotal: dmr_socket_disconnections_total,
  dmrSocketDisconnectionsTotalHelp: dmr_socket_disconnections_total + '_help',
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
