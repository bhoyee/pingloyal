import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { FileImportProcessPayload } from './file-import.service';
import { FILE_IMPORT_PROCESS_EVENT, FileImportService } from './file-import.service';

@Injectable()
export class FileImportListener {
  constructor(private readonly fileImportService: FileImportService) {}

  @OnEvent(FILE_IMPORT_PROCESS_EVENT)
  handleFileImportProcess(payload: FileImportProcessPayload): Promise<void> {
    return this.fileImportService.processFile(payload);
  }
}
