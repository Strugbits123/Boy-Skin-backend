import DbService from "./db.service";
import DatabaseConfig from "../config/db";
import RecommendationService from "./recommendation.service";


class AppStarterService {
    static async onStartApp() {
        DatabaseConfig.connectToDatabase();
        await DbService.startCacheUpdateCron();
    }
}

export default AppStarterService;