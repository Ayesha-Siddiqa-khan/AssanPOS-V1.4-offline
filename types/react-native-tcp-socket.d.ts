declare module 'react-native-tcp-socket' {
  const TcpSocket: {
    createConnection: (
      options: { host: string; port: number; timeout?: number },
      connectionListener?: () => void
    ) => any;
  };
  export default TcpSocket;
}
