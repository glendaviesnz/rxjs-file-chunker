import * as axios from 'axios';
import { Observable } from 'rxjs';

import { appConfig } from './config.js';

export function httpUpload(file) {
    return Observable.create((observer) => {
        var config = {
            onUploadProgress: (progressEvent)  => {
                var percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                observer.next({ progress: percentCompleted });
            }
        };
        axios.post(`${appConfig.apiUrl}/upload`, file, config)
            .then((response) => {
                observer.next({ status: response.status });
                observer.complete();
            })
            .catch((error) => {
                observer.error(error);
            });
    })
};