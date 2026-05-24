import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { ImportProcessPayload } from './import.service';
import { IMPORT_PROCESS_EVENT, ImportService } from './import.service';

@Injectable()
export class ImportListener {
  constructor(private readonly importService: ImportService) {}

  @OnEvent(IMPORT_PROCESS_EVENT)
  handleImportProcess(payload: ImportProcessPayload): Promise<void> {
    return this.importService.processImport(payload);
  }
}
