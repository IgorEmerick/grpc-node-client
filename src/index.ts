import { credentials, loadPackageDefinition } from '@grpc/grpc-js';
import { loadSync } from '@grpc/proto-loader';
import * as path from 'path';
import { TRpcRequest, TRpcResponse } from './types';

type TReadableStream = {
  on: (event: string, callback: (event?: unknown) => void) => TReadableStream;
};

type TWritableStream = {
  write: (request: TRpcRequest) => Promise<void>;
  end: () => void;
};

interface IBidirectionalStream extends TWritableStream {
  on: (
    event: string,
    callback: (event?: unknown) => void,
  ) => IBidirectionalStream;
}

type TRpcClient = {
  simpleRpc: (
    request: TRpcRequest,
    callback: (error: unknown, response: TRpcResponse) => void,
  ) => void;
  serverSideRpcStreaming: (request: TRpcRequest) => TReadableStream;
  clientSideRpcStreaming: (
    callback: (error: unknown, status: TRpcResponse) => void,
  ) => TWritableStream;
  bidirectionalRpcStreaming: () => IBidirectionalStream;
};

export class ExampleClient {
  private rpcClient: TRpcClient;

  constructor(serverUrl: string) {
    const protoPath = path.resolve(
      __dirname,
      '**',
      'protocols',
      'ServerProto.proto',
    );

    const packageDefinition = loadSync(protoPath, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });

    const protoDescriptor = loadPackageDefinition(packageDefinition);

    const protoPackage = protoDescriptor.server;

    this.rpcClient = new protoPackage['Server'](
      serverUrl,
      credentials.createInsecure(),
    );
  }

  async simpleRpc(request: TRpcRequest): Promise<TRpcResponse> {
    return new Promise<TRpcResponse>((resolve, reject) => {
      this.rpcClient.simpleRpc(request, (error, response) => {
        if (error) reject(error);

        resolve(response);
      });
    });
  }

  async serverSideRpcStreaming(request: TRpcRequest): Promise<TRpcResponse[]> {
    return new Promise<TRpcResponse[]>((resolve, reject) => {
      const response: TRpcResponse[] = [];

      this.rpcClient
        .serverSideRpcStreaming(request)
        .on('data', data => response.push(data as TRpcResponse))
        .on('end', () => resolve(response))
        .on('error', error => reject(error))
        .on('status', status => console.log(status));
    });
  }

  async clientSideRpcStreaming(requests: TRpcRequest[]): Promise<TRpcResponse> {
    return new Promise<TRpcResponse>((resolve, reject) => {
      const call = this.rpcClient.clientSideRpcStreaming((error, response) => {
        if (error) reject(error);

        resolve(response);
      });

      Promise.all(requests.map(async request => call.write(request))).then(() =>
        call.end(),
      );
    });
  }

  async bidirectionalRpcStreaming(
    requests: TRpcRequest[],
  ): Promise<TRpcResponse[]> {
    return new Promise<TRpcResponse[]>((resolve, reject) => {
      const response: TRpcResponse[] = [];

      const call = this.rpcClient
        .bidirectionalRpcStreaming()
        .on('data', data => response.push(data as TRpcResponse))
        .on('status', status => {
          console.log(status);

          resolve(response);
        })
        .on('error', error => reject(error));

      Promise.all(requests.map(async request => call.write(request))).then(() =>
        call.end(),
      );
    });
  }
}
