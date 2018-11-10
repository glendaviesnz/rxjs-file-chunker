import { Subject, Observable, combineLatest, of, Observer } from 'rxjs';
import { mergeMap, reduce, filter, map, tap, take, publish, toArray } from 'rxjs/operators';
import * as SparkMD5 from 'spark-md5';

const chunkSize = 1024 * 1024;
const chunkQueue$ = new Subject();
const maxConnections = 3;

// this is where the magic happens a queue of document chunk uploads that limits the number of 
// concurrent uploads - in just 3 lines of code - got to love RxJs!
chunkQueue$
    .pipe(mergeMap((data) => data, null, maxConnections))
    .subscribe();

function uploadFile(fileData) {
    const chunkSizes = calculateChunks(fileData.file.size, chunkSize);
    fileData.chunkSizes = chunkSizes;
    const getChunks$ = getChunks(fileData);

    const chunkArray$ = getChunks$.pipe(toArray());
    chunkArray$.subscribe(chunks => console.log(chunks));
    // const calculateMD5$ = getChunks$.pipe(reduce((acc: number, chunk: Chunk) => {
    //     return acc ^ crc32.computeHash(chunk.byteArray, 0, chunk.byteArray.length);
    // }, 0));

    // startChunkUpload(chunkArray$, calculateMD5$);

    getChunks$.connect();

}

function calculateChunks(fileSize, chunkSize) {
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

function getChunks(fileData) {
    return Observable.create((observer) => {
        chunkReader(0, fileData, observer);
    }).pipe(publish());
}

function chunkReader(index, fileData, observer) {
    if (index >= fileData.chunkSizes.length) {
        observer.complete();
    } else {
        const fileReader = new FileReader();
        const chunk = fileData.chunkSizes[index];
        fileReader.onloadend = (evt: any) => {
            const unint8Array = new Uint8Array(evt.target.result);
            observer.next({
                fileSize: fileData.file.size,
                fileName: fileData.file.name,
                byteArray: unint8Array,
                sequence: index + 1,
                totalChunks: fileData.chunkSizes.length,
                fileMD5: null,
            });
            chunkReader(index + 1, fileData, observer);
        };
        const chunkBlob = fileData.file.slice(chunk.startByte, chunk.endByte);
        fileReader.readAsArrayBuffer(chunkBlob);
    }
}

// function calculateMD5() {
//     const spark = new SparkMD5.ArrayBuffer();
//     const fileReader = new FileReader();

//     fileReader.onload = function (e) {
//         console.log('read chunk nr', currentChunk + 1, 'of', chunks);
//         spark.append(e.target.result);                   // Append array buffer
//         currentChunk++;

//         if (currentChunk < chunks) {
//             loadNext();
//         } else {
//             console.log('finished loading');
//             console.info('computed hash', spark.end());  // Compute hash
//         }
//     };

//     fileReader.onerror = function () {
//         console.warn('oops, something went wrong.');
//     };

//     function loadNext() {
//         var start = currentChunk * chunkSize,
//             end = ((start + chunkSize) >= file.size) ? file.size : start + chunkSize;

//         fileReader.readAsArrayBuffer(blobSlice.call(file, start, end));
//     }

//     loadNext();
// }
// function startChunkUpload(chunkArray$: Observable<Chunk[]>, calculateCrc$: Observable<number>) {
//     combineLatest(chunkArray$, calculateCrc$, (chunksArray: Chunk[], crc: number) => {
//         const chunksWithCrc = chunksArray.map(chunk => {
//             chunk.fileCrc = crc;
//             return chunk;
//         });
//         return chunksWithCrc;
//     })
//         .pipe(
//             filter((chunks: Chunk[]) => chunks.length > 0),
//             map((chunks: Chunk[]) => this.uploadFirstChunk(chunks))
//         )
//         .subscribe();
// }

// function uploadFirstChunk(chunks: Chunk[]) {
//     const firstChunk = chunks[0];
//     firstChunk.data = new Blob([firstChunk.byteArray]);
//     firstChunk.byteArray = null;

//     const firstChunk$ = this._apiService.uploadChunk(chunks[0])
//         .pipe(
//             filter((event: HttpEvent<any>) => event.type === HttpEventType.UploadProgress || event instanceof HttpResponse),
//             tap((event: HttpProgressEvent | HttpResponse<any>) => {
//                 if (event.type === HttpEventType.UploadProgress) {
//                     this.trackProgress(firstChunk, event.loaded, event.total);
//                 }
//             }),
//             filter((event: HttpEvent<any>) => event instanceof HttpResponse),
//             take(1),
//             map((event: HttpResponse<any>) => {
//                 const body = event.body;
//                 const uploadDocumentId = body.uploadDocumentId;
//                 if (chunks.length > 1) {
//                     return this.uploadRemainingChunks(chunks, uploadDocumentId);
//                 } else {
//                     const documentUploadRequestId = body.documentUploadRequestId;
//                     this.completeUpload(firstChunk.placeholder, firstChunk.tabId, event.status, documentUploadRequestId);
//                 }
//             })
//         )
//         .catch((error) => this.handleError(firstChunk, error));
//     this._chunkQueue$.next(firstChunk$);
// }

// function uploadRemainingChunks(chunks: Chunk[], uploadDocumentId: number) {
//     const remainingChunks = chunks
//         .filter((chunk: Chunk) => chunk.sequence > 1)
//         .map((chunk: Chunk) => {
//             chunk.uploadDocumentId = uploadDocumentId;
//             return chunk;
//         });
//     this.uploadChunk(0, remainingChunks);
// }

// function uploadChunk(index: number, chunks: Chunk[]) {
//     const chunk = chunks[index];
//     chunk.data = new Blob([chunk.byteArray]);
//     chunk.fileSize = chunk.data.size;
//     chunk.byteArray = null;
//     const chunk$ = this._apiService.uploadChunk(chunk)
//         .pipe(filter((event: HttpEvent<any>) => event.type === HttpEventType.UploadProgress
//             || event instanceof HttpResponse),
//             tap((event: HttpProgressEvent | HttpResponse<any>) => {
//                 if (event.type === HttpEventType.UploadProgress) {
//                     this.trackProgress(chunk, event.loaded, event.total);
//                 }
//             }),
//             filter((event: HttpEvent<any>) => event instanceof HttpResponse),
//             take(1),
//             map((event: HttpResponse<any>) => {
//                 if (chunk.sequence === chunk.totalChunks) {
//                     const documentUploadRequestId = event.body.documentUploadRequestId;
//                     this.completeUpload(chunk.placeholder, chunk.tabId, event.status, documentUploadRequestId);
//                 } else {
//                     this.uploadChunk(index + 1, chunks);
//                 }
//                 return { status: 'done' };
//             })
//         )
//         .catch((error) => this.handleError(chunk, error));
//     this._chunkQueue$.next(chunk$);
// }

// function trackProgress(chunk: Chunk, loaded: number, total: number) {
//     const chunkPercentage = (100 / chunk.totalChunks);
//     const percentageComplete = (chunk.sequence - 1) * chunkPercentage;
//     const percentDone = Math.round(((100 * loaded / total) / chunk.totalChunks) + percentageComplete);
// }

// function completeUpload(status: number) {

//     if (status === 200) {
//         // success
//     }
// }

// function handleError(chunk: Chunk, error: any) {
//     return of(error);
// }
