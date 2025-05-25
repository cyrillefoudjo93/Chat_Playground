import {
  Controller,
  Get,
  Post,
  Delete,
  Put,
  Body,
  Param,
  UseGuards,
  Query,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RateLimitingService, RateLimitRule, RateLimitStats } from '../services/rate-limiting.service';

export class CreateRateLimitRuleDto {
  name: string;
  path: string;
  method?: string;
  ttl: number;
  limit: number;
}

export class UpdateRateLimitRuleDto {
  path?: string;
  method?: string;
  ttl?: number;
  limit?: number;
}

@Controller('admin/rate-limiting')
@UseGuards(JwtAuthGuard)
export class RateLimitingController {
  constructor(private readonly rateLimitingService: RateLimitingService) {}

  @Get('stats')
  async getStats(): Promise<RateLimitStats> {
    try {
      return await this.rateLimitingService.getStats();
    } catch (error) {
      throw new HttpException(
        'Failed to retrieve rate limiting stats',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('rules')
  listRules(): RateLimitRule[] {
    return this.rateLimitingService.listRules();
  }

  @Post('rules')
  createRule(@Body() createRuleDto: CreateRateLimitRuleDto): { success: boolean; message: string } {
    try {
      const rule: RateLimitRule = {
        name: createRuleDto.name,
        path: createRuleDto.path,
        method: createRuleDto.method,
        ttl: createRuleDto.ttl,
        limit: createRuleDto.limit,
      };

      this.rateLimitingService.addRule(rule);
      
      return {
        success: true,
        message: `Rate limiting rule '${rule.name}' created successfully`,
      };
    } catch (error) {
      throw new HttpException(
        'Failed to create rate limiting rule',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Put('rules/:name')
  updateRule(
    @Param('name') name: string,
    @Body() updateRuleDto: UpdateRateLimitRuleDto,
  ): { success: boolean; message: string } {
    try {
      const updated = this.rateLimitingService.updateRule(name, updateRuleDto);
      
      if (!updated) {
        throw new HttpException(
          `Rate limiting rule '${name}' not found`,
          HttpStatus.NOT_FOUND,
        );
      }

      return {
        success: true,
        message: `Rate limiting rule '${name}' updated successfully`,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to update rate limiting rule',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Delete('rules/:name')
  deleteRule(@Param('name') name: string): { success: boolean; message: string } {
    try {
      const removed = this.rateLimitingService.removeRule(name);
      
      if (!removed) {
        throw new HttpException(
          `Rate limiting rule '${name}' not found`,
          HttpStatus.NOT_FOUND,
        );
      }

      return {
        success: true,
        message: `Rate limiting rule '${name}' deleted successfully`,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to delete rate limiting rule',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post('reset/:clientKey')
  async resetClientLimit(
    @Param('clientKey') clientKey: string,
  ): Promise<{ success: boolean; message: string }> {
    try {
      await this.rateLimitingService.resetClientLimit(clientKey);
      
      return {
        success: true,
        message: `Rate limit reset for client '${clientKey}'`,
      };
    } catch (error) {
      throw new HttpException(
        'Failed to reset client rate limit',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('clear-all')
  async clearAllLimits(): Promise<{ success: boolean; message: string }> {
    try {
      await this.rateLimitingService.clearAllLimits();
      
      return {
        success: true,
        message: 'All rate limits cleared successfully',
      };
    } catch (error) {
      throw new HttpException(
        'Failed to clear all rate limits',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('health')
  async healthCheck(): Promise<{ healthy: boolean; details: any }> {
    try {
      const stats = await this.rateLimitingService.getStats();
      
      return {
        healthy: stats.redisHealth,
        details: {
          redisHealth: stats.redisHealth,
          totalRequests: stats.totalRequests,
          blockedRequests: stats.blockedRequests,
          blockRate: stats.totalRequests > 0 
            ? (stats.blockedRequests / stats.totalRequests * 100).toFixed(2) + '%'
            : '0%',
          activeRules: stats.activeRules.length,
        },
      };
    } catch (error) {
      return {
        healthy: false,
        details: {
          error: 'Failed to check rate limiting health',
        },
      };
    }
  }
}
