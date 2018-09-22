export class ChunkingService {
    public chunkSize = 1024 * 1024;
    private _chunkQueue$ = new Subject();
    private _maxConnections = 3;

    constructor(
        private _apiService: apiService,
        private _store: Store<any>) {
        Guard.notNothing(_apiService, '_apiService');
        Guard.notNothing(_store, '_store');

        // this is where the magic happens a queue of document chunk uploads that limits the number of 
        // concurrent uploads - in just 3 lines of code - got to love RxJs!
        this._chunkQueue$
            .pipe(mergeMap((data: any) => data, null, this._maxConnections))
            .subscribe();
    }
          
    public uploadDocument(documentData: UploadDocument) {
        const crc32 = new CRC32(); // crc is used to validate file when chunks recombined on server
        const chunkSizes = this.calculateChunks(documentData.document.size, this.chunkSize);
        documentData.chunkSizes = chunkSizes;
        const getChunks$ = this.getChunks(0, documentData);

        const chunkArray$ = getChunks$.toArray();

        const calculateCrc$ = getChunks$.pipe(reduce((acc: number, chunk: Chunk) => {
            return acc ^ crc32.computeHash(chunk.byteArray, 0, chunk.byteArray.length);
        }, 0));

        this.startChunkUpload(chunkArray$, calculateCrc$);

        getChunks$.connect();

    }

    private calculateChunks(fileSize: number, chunkSize: number) {
        const chunkSizes: ChunkSize[] = [];
        const numberOfChunks = Math.max(Math.ceil(fileSize / chunkSize), 1);
        for (let offset = 0; offset < numberOfChunks; offset++) {
            const startByte = offset * chunkSize;
            const endByte = Math.min(fileSize, (offset + 1) * chunkSize);
            chunkSizes.push(
                { startByte, endByte }
            );
        }
        return chunkSizes;
    }

    private getChunks(documentData: UploadDocument) {
        return Observable.create((observer: Observer<Chunk>) => {
            this.chunkReader(0, documentData, observer);
        }).publish();
    }

    private chunkReader(index: number, documentData: UploadDocument, observer: Observer<Chunk>) {
        if (index >= documentData.chunkSizes.length) {
            observer.complete();
        } else {
            const fileReader = new FileReader();
            const chunk = documentData.chunkSizes[index];
            fileReader.onloadend = (evt: any) => {
                const unint8Array = new Uint8Array(evt.target.result);
                observer.next({
                    documentId: documentData.documentId,
                    fileSize: documentData.document.size,
                    fileName: documentData.document.name,
                    byteArray: unint8Array,
                    sequence: index + 1,
                    totalChunks: documentData.chunkSizes.length,
                    isLast: ((index === documentData.chunkSizes.length - 1)) ? true : false,
                    data: null,
                    fileCrc: null,
                });
                this.chunkReader(index + 1, documentData, observer);
            };
            const chunkBlob = documentData.document.slice(chunk.startByte, chunk.endByte);
            fileReader.readAsArrayBuffer(chunkBlob);
        }
    }

    private startChunkUpload(chunkArray$: Observable<Chunk[]>, calculateCrc$: Observable<number>) {
        Observable.combineLatest(chunkArray$, calculateCrc$, (chunksArray: Chunk[], crc: number) => {
            const chunksWithCrc = chunksArray.map(chunk => {
                chunk.fileCrc = crc;
                return chunk;
            });
            return chunksWithCrc;
        })
            .pipe(
                filter((chunks: Chunk[]) => chunks.length > 0),
                map((chunks: Chunk[]) => this.uploadFirstChunk(chunks))
            )
            .subscribe();
    }

    private uploadFirstChunk(chunks: Chunk[]) {
        const firstChunk = chunks[0];
        firstChunk.data = new Blob([firstChunk.byteArray]);
        firstChunk.byteArray = null;

        const firstChunk$ = this._apiService.uploadChunk(chunks[0])
            .pipe(
                filter((event: HttpEvent<any>) => event.type === HttpEventType.UploadProgress || event instanceof HttpResponse),
                tap((event: HttpProgressEvent | HttpResponse<any>) => {
                    if (event.type === HttpEventType.UploadProgress) {
                        this.trackProgress(firstChunk, event.loaded, event.total);
                    }
                }),
                filter((event: HttpEvent<any>) => event instanceof HttpResponse),
                take(1),
                map((event: HttpResponse<any>) => {
                    const body = event.body;
                    const uploadDocumentId = body.uploadDocumentId;
                    if (chunks.length > 1) {
                        return this.uploadRemainingChunks(chunks, uploadDocumentId);
                    } else {
                        const documentUploadRequestId = body.documentUploadRequestId;
                        this.completeUpload(firstChunk.placeholder, firstChunk.tabId, event.status, documentUploadRequestId);
                    }
                })
            )
            .catch((error) => this.handleError(firstChunk, error));
        this._chunkQueue$.next(firstChunk$);
    }

    private uploadRemainingChunks(chunks: Chunk[], uploadDocumentId: number) {
        const remainingChunks = chunks
            .filter((chunk: Chunk) => chunk.sequence > 1)
            .map((chunk: Chunk) => {
                chunk.uploadDocumentId = uploadDocumentId;
                return chunk;
            });
        this.uploadChunk(0, remainingChunks);
    }

    private uploadChunk(index: number, chunks: Chunk[]) {
        const chunk = chunks[index];
        chunk.data = new Blob([chunk.byteArray]);
        chunk.fileSize = chunk.data.size;
        chunk.byteArray = null;
        const chunk$ = this._apiService.uploadChunk(chunk)
            .pipe(filter((event: HttpEvent<any>) => event.type === HttpEventType.UploadProgress
                || event instanceof HttpResponse),
                tap((event: HttpProgressEvent | HttpResponse<any>) => {
                    if (event.type === HttpEventType.UploadProgress) {
                        this.trackProgress(chunk, event.loaded, event.total);
                    }
                }),
                filter((event: HttpEvent<any>) => event instanceof HttpResponse),
                take(1),
                map((event: HttpResponse<any>) => {
                    if (chunk.sequence === chunk.totalChunks) {
                        const documentUploadRequestId = event.body.documentUploadRequestId;
                        this.completeUpload(chunk.placeholder, chunk.tabId, event.status, documentUploadRequestId);
                    } else {
                        this.uploadChunk(index + 1, chunks);
                    }
                    return { status: 'done' };
                })
            )
            .catch((error) => this.handleError(chunk, error));
        this._chunkQueue$.next(chunk$);
    }
          
    private trackProgress(chunk: Chunk, loaded: number, total: number) {
        const chunkPercentage = (100 / chunk.totalChunks);
        const percentageComplete = (chunk.sequence - 1) * chunkPercentage;
        const percentDone = Math.round(((100 * loaded / total) / chunk.totalChunks) + percentageComplete);

        this._store.dispatch(new UpdateUploadProgressAction({
            documentId: chunk.documentId, percentDone: percentDone
        }));
    }

    private completeUpload(placeholder: Placeholder, tabId: number, status: number, documentUploadRequestId: number) {
        const document = placeholder.document;

        if (status === 200) {
            document.uploading = true;
        }

        document.tempName = null;
        document.clientUploading = false;

        this._store.dispatch(new ClearUploadProgressAction(placeholder.document.documentId));
        this._store.dispatch(new EnableRefreshAction());
        this._store.dispatch(new UpdatePlaceholderAction({
            tabId: tabId,
            placeholder: placeholder,
            immutable: true
        }));
    }

    private handleError(chunk: Chunk, error: any) {
        const placeholder = chunk.placeholder;
        placeholder.document.clientUploading = false;
        const tabId = chunk.tabId;
        this._store.dispatch(new UpdatePlaceholderAction({ tabId, placeholder, immutable: true }));
        return Observable.of(error);
    }

}