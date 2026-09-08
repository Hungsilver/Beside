import { Module } from '@nestjs/common';
import { StorageModule } from '../common/storage/storage.module';
import { ImageProcessor } from '../posts/image.processor';
import { AvatarController, UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  // StorageModule + ImageProcessor: ảnh đại diện đi qua ĐÚNG đường ống của ảnh
  // check-in — cùng luật xoá EXIF, cùng trần dung lượng, cùng chốt ảnh bom nén.
  imports: [StorageModule],
  controllers: [UsersController, AvatarController],
  providers: [UsersService, ImageProcessor],
  exports: [UsersService],
})
export class UsersModule {}
