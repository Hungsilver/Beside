import { Module } from '@nestjs/common';
import { StorageModule } from '../common/storage/storage.module';
import { LocationsModule } from '../locations/locations.module';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';
import { CommentsController } from './comments.controller';
import { CommentsService } from './comments.service';
import { ImageProcessor } from './image.processor';

@Module({
  // LocationsModule: check-in có ghim toạ độ đi qua đúng LocationsService
  // để chịu chung mọi luật riêng tư, không ghi thẳng vào bảng vị trí.
  imports: [StorageModule, LocationsModule],
  controllers: [PostsController, CommentsController],
  providers: [PostsService, CommentsService, ImageProcessor],
  exports: [PostsService],
})
export class PostsModule {}
