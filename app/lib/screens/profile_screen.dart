import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/auth_provider.dart';
import '../providers/theme_provider.dart';
import '../services/api_service.dart';
import '../utils/app_theme.dart';
import '../utils/constants.dart';
import 'login_screen.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  final ApiService _api = ApiService();
  bool _todayCheckedIn = false;

  @override
  void initState() {
    super.initState();
    _loadUserInfo();
  }

  Future<void> _loadUserInfo() async {
    final authProvider = context.read<AuthProvider>();
    if (authProvider.isLoggedIn) {
      await authProvider.refreshUser();
      final result = await _api.getCurrentUser();
      if (result['success']) {
        setState(() => _todayCheckedIn = result['data']['today_checked_in'] ?? false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final authProvider = context.watch<AuthProvider>();
    final themeProvider = context.watch<ThemeProvider>();

    if (!authProvider.isLoggedIn) {
      return _buildLoginRequired();
    }

    final user = authProvider.user ?? {};
    final level = user['level'] ?? 1;
    final exp = user['exp'] ?? 0;
    final levelConfig = AppConstants.levelConfig.firstWhere((e) => e['level'] == level, orElse: () => AppConstants.levelConfig.first);
    final nextLevelConfig = AppConstants.levelConfig.firstWhere((e) => e['level'] == level + 1, orElse: () => {'minExp': exp});
    final expProgress = level >= 10 ? 1.0 : (exp - levelConfig['minExp']) / (nextLevelConfig['minExp'] - levelConfig['minExp']);

    return Scaffold(
      body: SingleChildScrollView(
        child: Column(
          children: [
            // 用户信息卡片
            Container(
              width: double.infinity,
              padding: const EdgeInsets.fromLTRB(20, 60, 20, 24),
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [AppTheme.primaryColor.withOpacity(0.15), Theme.of(context).scaffoldBackgroundColor],
                ),
              ),
              child: Column(
                children: [
                  Row(
                    children: [
                      // 头像
                      CircleAvatar(
                        radius: 32,
                        backgroundColor: AppTheme.primaryColor,
                        child: Text(
                          user['nickname']?.toString().substring(0, 1) ?? 'U',
                          style: const TextStyle(fontSize: 24, color: Colors.white, fontWeight: FontWeight.bold),
                        ),
                      ),
                      const SizedBox(width: 16),
                      // 用户信息
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Text(user['nickname'] ?? '云屿用户', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                                const SizedBox(width: 8),
                                if (authProvider.isAdmin)
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                    decoration: BoxDecoration(color: Colors.orange.withOpacity(0.15), borderRadius: BorderRadius.circular(4)),
                                    child: Text(
                                      AppConstants.roleLabels[user['role']] ?? '管理员',
                                      style: const TextStyle(fontSize: 10, color: Colors.orange, fontWeight: FontWeight.w600),
                                    ),
                                  ),
                              ],
                            ),
                            const SizedBox(height: 4),
                            Text(user['signature'] ?? '这个人很懒，什么都没写', style: TextStyle(fontSize: 13, color: Theme.of(context).textTheme.bodySmall?.color), maxLines: 1, overflow: TextOverflow.ellipsis),
                            const SizedBox(height: 8),
                            // 等级和经验
                            Row(
                              children: [
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                  decoration: BoxDecoration(color: AppTheme.primaryColor.withOpacity(0.1), borderRadius: BorderRadius.circular(6)),
                                  child: Text('LV$level ${levelConfig['name']}', style: const TextStyle(fontSize: 11, color: AppTheme.primaryColor, fontWeight: FontWeight.w600)),
                                ),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: ClipRRect(
                                    borderRadius: BorderRadius.circular(4),
                                    child: LinearProgressIndicator(
                                      value: expProgress.clamp(0.0, 1.0),
                                      backgroundColor: Theme.of(context).dividerColor.withOpacity(0.2),
                                      valueColor: const AlwaysStoppedAnimation<Color>(AppTheme.primaryColor),
                                      minHeight: 6,
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 8),
                                Text('$exp/${nextLevelConfig['minExp']}', style: TextStyle(fontSize: 10, color: Theme.of(context).textTheme.bodySmall?.color)),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 20),
                  // 数据统计
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceAround,
                    children: [
                      _buildStatItem('${user['posts_count'] ?? 0}', '帖子'),
                      _buildStatItem('${user['comments_count'] ?? 0}', '评论'),
                      _buildStatItem('${user['likes_received'] ?? 0}', '获赞'),
                      _buildStatItem('${user['followers_count'] ?? 0}', '粉丝'),
                      _buildStatItem('${user['following_count'] ?? 0}', '关注'),
                    ],
                  ),
                ],
              ),
            ),
            // 签到卡片
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              child: Card(
                child: ListTile(
                  leading: Container(
                    width: 40,
                    height: 40,
                    decoration: BoxDecoration(color: Colors.orange.withOpacity(0.1), borderRadius: BorderRadius.circular(10)),
                    child: const Icon(Icons.calendar_today, color: Colors.orange),
                  ),
                  title: const Text('每日签到', style: TextStyle(fontWeight: FontWeight.w600)),
                  subtitle: Text('连续签到${user['continuous_checkin'] ?? 0}天 · 累计${user['total_checkin'] ?? 0}天'),
                  trailing: ElevatedButton(
                    onPressed: _todayCheckedIn
                        ? null
                        : () async {
                            final result = await _api.checkin();
                            if (result['success']) {
                              setState(() => _todayCheckedIn = true);
                              _loadUserInfo();
                              if (mounted) {
                                ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(result['message'] ?? '签到成功')));
                              }
                            }
                          },
                    style: ElevatedButton.styleFrom(padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8)),
                    child: Text(_todayCheckedIn ? '已签到' : '签到'),
                  ),
                ),
              ),
            ),
            // 功能列表
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              child: Card(
                child: Column(
                  children: [
                    _buildMenuItem(Icons.post_add, '我的帖子', () {}),
                    _buildMenuItem(Icons.comment, '我的评论', () {}),
                    _buildMenuItem(Icons.bookmark_border, '我的收藏', () {}),
                    _buildMenuItem(Icons.people_outline, '我的关注', () {}),
                    _buildMenuItem(Icons.emoji_events, '等级中心', () {}),
                    _buildMenuItem(Icons.assignment, '任务中心', () {}),
                  ],
                ),
              ),
            ),
            // 管理员入口
            if (authProvider.isAdmin)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                child: Card(
                  child: Column(
                    children: [
                      _buildMenuItem(Icons.admin_panel_settings, '云屿管理中心', () {}, color: Colors.orange),
                    ],
                  ),
                ),
              ),
            // 设置列表
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              child: Card(
                child: Column(
                  children: [
                    _buildMenuItem(Icons.dark_mode, '深色模式', () {
                      themeProvider.toggleTheme();
                    }, trailing: Switch(
                      value: themeProvider.isDarkMode,
                      onChanged: (_) => themeProvider.toggleTheme(),
                    )),
                    _buildMenuItem(Icons.settings, '设置', () {}),
                    _buildMenuItem(Icons.help_outline, '帮助中心', () {}),
                    _buildMenuItem(Icons.info_outline, '关于云屿', () {}),
                    _buildMenuItem(Icons.logout, '退出登录', () async {
                      await authProvider.logout();
                      if (mounted) {
                        Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => const LoginScreen()));
                      }
                    }, color: Colors.red),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }

  Widget _buildStatItem(String value, String label) {
    return Column(
      children: [
        Text(value, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
        const SizedBox(height: 4),
        Text(label, style: TextStyle(fontSize: 12, color: Theme.of(context).textTheme.bodySmall?.color)),
      ],
    );
  }

  Widget _buildMenuItem(IconData icon, String title, VoidCallback onTap, {Color? color, Widget? trailing}) {
    return ListTile(
      leading: Icon(icon, color: color ?? Theme.of(context).textTheme.bodyMedium?.color),
      title: Text(title, style: TextStyle(color: color ?? Theme.of(context).textTheme.bodyMedium?.color)),
      trailing: trailing ?? Icon(Icons.chevron_right, size: 18, color: Theme.of(context).textTheme.bodySmall?.color),
      onTap: onTap,
    );
  }

  Widget _buildLoginRequired() {
    return Scaffold(
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 80,
              height: 80,
              decoration: BoxDecoration(
                gradient: AppTheme.primaryGradient,
                borderRadius: BorderRadius.circular(24),
              ),
              child: const Icon(Icons.cloud, size: 40, color: Colors.white),
            ),
            const SizedBox(height: 24),
            const Text('云屿', style: TextStyle(fontSize: 28, fontWeight: FontWeight.bold, letterSpacing: 4)),
            const SizedBox(height: 8),
            Text('登录后查看个人中心', style: TextStyle(color: Theme.of(context).textTheme.bodySmall?.color)),
            const SizedBox(height: 32),
            ElevatedButton(
              onPressed: () {
                Navigator.of(context).push(MaterialPageRoute(builder: (_) => const LoginScreen()));
              },
              style: ElevatedButton.styleFrom(padding: const EdgeInsets.symmetric(horizontal: 48, vertical: 14)),
              child: const Text('立即登录'),
            ),
          ],
        ),
      ),
    );
  }
}
