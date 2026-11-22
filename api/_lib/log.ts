/** The one logging surface the API needs: warnings go to the server log, never to the client. */
export type Logger = Pick<Console, 'warn'>;
