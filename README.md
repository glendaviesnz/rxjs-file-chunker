# rxjs-file-chunker
An example of an rxjs service for taking a user uploaded file and breaking it into chunks and sequentially sending to the server

This is something I built for specific project, so is here as an example that could be taken and modified, rather than a generic uploader that could be used in any project.

The chunking and uploading service currently chunks the file into 1MB chunks, get a checksum for the file, and then uploads each chunk sequentially. There is a max concurrency setting which currently allows only 3 chunks at a time to upload and the others are queued. This is to prevent all the browsers http connections to a single domain to be maxed out with file uploads.

