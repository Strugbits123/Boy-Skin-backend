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

        // Run client test cases validation
        console.log('🧪 Running client test cases validation...');
        try {
            await TestDataService.runClientTestCases();
            console.log('✅ Client test cases validation completed!');
        } catch (error) {
            console.error('❌ Client test cases failed:', error);
            console.log('⚠️  Server will continue but recommendations may have issues.');
        }

        // Quick health check
        console.log('🔍 Running quick health check...');
        try {
            const healthStatus = await TestDataService.quickHealthCheck();
            console.log(`🏥 System health check: ${healthStatus ? 'PASSED' : 'FAILED'}`);
        } catch (error) {
            console.error('❌ Health check failed:', error);
        }
    }
}

export default AppStarterService;