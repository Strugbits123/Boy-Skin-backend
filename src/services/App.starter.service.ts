import DbService from "./db.service";
import DatabaseConfig from "../config/db";
import RecommendationService from "./recommendation.service";
import TestDataService from "./TestData.service";


class AppStarterService {
    static async onStartApp() {
        console.log('🚀 Starting Boy-Skin Recommendation System...');

        // Connect to database
        DatabaseConfig.connectToDatabase();

        // Start cache update cron
        await DbService.startCacheUpdateCron();

        // Run automated system tests
        // console.log('🧪 Running startup validation tests...');
        // try {
        //     await TestDataService.runStartupTests();
        //     console.log('✅ All startup tests passed! System is ready.');
        // } catch (error) {
        //     console.error('❌ Startup tests failed:', error);
        //     console.log('⚠️  Server will continue but recommendations may have issues.');
        // }

        // Quick health check
        // console.log('🔍 Running quick health check...');
        // try {
        //     await TestDataService.quickHealthCheck();
        //     console.log('✅ Health check passed! Core services operational.');
        // } catch (error) {
        //     console.error('❌ Health check failed:', error);
        // }
    }
}

export default AppStarterService;