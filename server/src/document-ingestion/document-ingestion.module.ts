import { Module } from '@nestjs/common';
import { DocumentIngestionService } from './services/document-ingestion.service';

@Module({
  providers: [DocumentIngestionService],
  exports: [DocumentIngestionService],
})
export class DocumentIngestionModule {}
