import React from 'react';

import { uploadFile } from './chunking.service';

const FileInput = () => {

    const handleFile = (file) => {
        uploadFile(file).subscribe(progress => console.log(progress));
    }

    const clearFileInput = (target) => {
        target.value = null;
    }

    return (
        <div>
            <input type="file" 
                onChange={(e) => handleFile(e.target.files[0])}
                onClick={(e) => clearFileInput(e.target)}
            />
        </div>
    )
}

export default FileInput;