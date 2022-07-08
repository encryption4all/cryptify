// Hacky way to deal with the fact that irma does not report errors...
export default mkIrmaErr;

function mkIrmaErr(reject: (reason?: any) => void) {
  IrmaErr.reject = reject;
  return IrmaErr;
}

class IrmaErr {
  static reject: (reason?: any) => void;

  stateChange(args: any) {
    if (
      args.newState === "Cancelled" ||
      args.newState === "Error" ||
      args.newState === "TimedOut"
    ) {
      console.log(args);
      IrmaErr.reject(
        new Error(`Error occured during irma session: ${args.toString()}`)
      );
    }
  }

  start() {}

  close() {
    return new Promise<void>((resolve, _) => {
      resolve();
    });
  }
}
