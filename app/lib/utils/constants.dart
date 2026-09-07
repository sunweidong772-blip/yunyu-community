class AppConstants {
  // API基础地址
  static const String apiBaseUrl = 'http://8.160.178.28:3001/api';

  // 应用信息
  static const String appName = '云屿';
  static const String appVersion = '1.0.0';
  static const String appDescription = '年轻、温暖、有陪伴感的软件聚合社区';

  // 存储键
  static const String tokenKey = 'yunyu_token';
  static const String userKey = 'yunyu_user';
  static const String themeKey = 'yunyu_theme';

  // 等级配置
  static const List<Map<String, dynamic>> levelConfig = [
    {'level': 1, 'name': '新人', 'minExp': 0},
    {'level': 2, 'name': '初来乍到', 'minExp': 100},
    {'level': 3, 'name': '云屿居民', 'minExp': 300},
    {'level': 4, 'name': '活跃居民', 'minExp': 600},
    {'level': 5, 'name': '热心用户', 'minExp': 1000},
    {'level': 6, 'name': '云屿达人', 'minExp': 1600},
    {'level': 7, 'name': '资深居民', 'minExp': 2400},
    {'level': 8, 'name': '云屿精英', 'minExp': 3500},
    {'level': 9, 'name': '云屿核心', 'minExp': 5000},
    {'level': 10, 'name': '云屿元老', 'minExp': 8000},
  ];

  static String getLevelName(int level) {
    final config = levelConfig.firstWhere(
      (e) => e['level'] == level,
      orElse: () => {'name': '未知'},
    );
    return config['name'];
  }

  // 软件分类
  static const List<String> softwareCategories = [
    '全部', '应用', '游戏', '工具', '社交', '娱乐',
    '学习', '效率', '系统', '摄影', '音乐', '视频', '其他'
  ];

  // 社区分类
  static const List<String> communityCategories = [
    '推荐', '热门', '最新', '关注', '话题'
  ];

  // 身份标识
  static const Map<String, String> roleLabels = {
    'user': '普通用户',
    'admin': '管理员',
    'senior_admin': '高级管理员',
    'content_admin': '内容管理员',
    'software_admin': '软件管理员',
    'super_admin': '云屿岛主',
  };

  // 官方QQ群
  static const String officialQQGroup = 'https://qun.qq.com/universal-share/share?ac=1&authKey=%2BVJ5IOvDI2lrF9d9xfNaNXh%2BsGd4YUVfsqa2BKL2cc8jpiRaSZngZ%2B9sefpHSIcJ&busi_data=eyJncm91cENvZGUiOiIxMTA5NzMxNDI1IiwidG9rZW4iOiJUVnpBdFF4eGJCYkZ1d1d5UW0zRERTSWd1TXp5WDduMzFabGMwckJNR3liTzVuUFphbURWSHgwUGhUWUUybTJFIiwidWluIjoiMjk5MTc5MjE1MiJ9&data=0Y1PUjA_CVhnuKy-KKtpilkJ9y0yP9nxbVjn0q0oufQPCU37o5TWGSRgRvH2fkc5Eoq2SQ5r5wyj0NF5sTL8Iw&svctype=4&tempid=h5_group_info';
}
