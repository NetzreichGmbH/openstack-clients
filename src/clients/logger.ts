export interface LoggerInterface {
  /**
   * Write a 'log' level log.
   */
  log(message: any, ...optionalParams: any[]): void;

  /**
   * Write an 'error' level log.
   */
  error(message: any, ...optionalParams: any[]): void;

}

export class Logger implements LoggerInterface {

  log(message: any, ...optionalParams: any[]): void {
    console.log(message, ...optionalParams);
  }

  error(message: any, ...optionalParams: any[]): void {
    console.error(message, ...optionalParams);
  }
}