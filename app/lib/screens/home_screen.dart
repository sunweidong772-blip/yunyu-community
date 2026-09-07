import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/auth_provider.dart';
import '../services/api_service.dart';
import '../utils/app_theme.dart';
import '../utils/constants.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final ApiService _api = ApiService();
  List<dynamic> _banners = [];
  List<dynamic> _recommendedSoftwares = [];
  List<dynamic> _hotPosts = [];
  bool _isLoading = true;

  final List<Map<String, dynamic>> _quickEntries = [
    {'icon': Icons.apps, 'label': '软件库', 'color': Colors.blue},
    {'icon': Icons.star, 'label': '精品软件', 'color': Colors.orange},
    {'icon': Icons.games, 'label': '游戏', 'color': Colors.purple},
    {'icon': Icons.build, 'label': '工具', 'color': Colors.green},
    {'icon': Icons.people, 'label': '热门社区', 'color': Colors.pink},
    {'icon': Icons.update, 'label': '最新更新', 'color': Colors.teal},
    {'icon': Icons.campaign, 'label': '官方公告', 'color': Colors.red},
    {'icon': Icons.more_horiz, 'label': '更多', 'color': Colors.grey},
  ];

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);

    // 加载推荐软件
    final softwareResult = await _api.getHomeRecommended();
    if (softwareResult['success']) {
      _recommendedSoftwares = softwareResult['data']['recommended'] ?? [];
    }

    // 加载热门帖子
    final postResult = await _api.getPosts(sort: 'hot', limit: 5);
    if (postResult['success']) {
      _hotPosts = postResult['data']['list'] ?? [];
    }

    // 模拟Banner
    _banners = [
      {'title': '欢迎来到云屿', 'subtitle': '发现优质软件，交流使用心得', 'color': AppTheme.primaryColor},
      {'title': '每日签到', 'subtitle': '连续签到获得更多经验', 'color': AppTheme.secondaryColor},
      {'title': '精品软件合集', 'subtitle': '精选优质应用推荐', 'color': AppTheme.warmColor},
    ];

    setState(() => _isLoading = false);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Row(
          children: [
            Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                gradient: AppTheme.primaryGradient,
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Icon(Icons.cloud, size: 18, color: Colors.white),
            ),
            const SizedBox(width: 8),
            const Text('云屿', style: TextStyle(fontWeight: FontWeight.bold)),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.search),
            onPressed: () {
              // TODO: 跳转到搜索页面
            },
          ),
          IconButton(
            icon: const Icon(Icons.notifications_outlined),
            onPressed: () {
              // TODO: 跳转到通知页面
            },
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _loadData,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  // Banner
                  _buildBanner(),
                  const SizedBox(height: 20),
                  // 快捷入口
                  _buildQuickEntries(),
                  const SizedBox(height: 24),
                  // 推荐软件
                  _buildSectionTitle('推荐软件', '查看全部'),
                  const SizedBox(height: 12),
                  _buildRecommendedSoftwares(),
                  const SizedBox(height: 24),
                  // 社区热门
                  _buildSectionTitle('社区热门', '查看全部'),
                  const SizedBox(height: 12),
                  _buildHotPosts(),
                ],
              ),
            ),
    );
  }

  Widget _buildBanner() {
    return SizedBox(
      height: 160,
      child: PageView.builder(
        itemCount: _banners.length,
        itemBuilder: (context, index) {
          final banner = _banners[index];
          return Container(
            margin: const EdgeInsets.symmetric(horizontal: 4),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [banner['color'], banner['color'].withOpacity(0.7)],
              ),
              borderRadius: BorderRadius.circular(20),
            ),
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    banner['title'],
                    style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    banner['subtitle'],
                    style: TextStyle(color: Colors.white.withOpacity(0.9), fontSize: 14),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _buildQuickEntries() {
    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 4,
        mainAxisSpacing: 16,
        crossAxisSpacing: 16,
      ),
      itemCount: _quickEntries.length,
      itemBuilder: (context, index) {
        final entry = _quickEntries[index];
        return Column(
          children: [
            Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(
                color: entry['color'].withOpacity(0.1),
                borderRadius: BorderRadius.circular(14),
              ),
              child: Icon(entry['icon'], color: entry['color']),
            ),
            const SizedBox(height: 6),
            Text(entry['label'], style: const TextStyle(fontSize: 12)),
          ],
        );
      },
    );
  }

  Widget _buildSectionTitle(String title, String action) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(title, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
        TextButton(
          onPressed: () {},
          child: Text(action, style: TextStyle(color: AppTheme.primaryColor, fontSize: 14)),
        ),
      ],
    );
  }

  Widget _buildRecommendedSoftwares() {
    if (_recommendedSoftwares.isEmpty) {
      return _buildEmptyState('暂无推荐软件');
    }
    return SizedBox(
      height: 120,
      child: ListView.builder(
        scrollDirection: Axis.horizontal,
        itemCount: _recommendedSoftwares.length,
        itemBuilder: (context, index) {
          final software = _recommendedSoftwares[index];
          return Container(
            width: 280,
            margin: const EdgeInsets.only(right: 12),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Theme.of(context).cardColor,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: Theme.of(context).dividerColor.withOpacity(0.2)),
            ),
            child: Row(
              children: [
                Container(
                  width: 56,
                  height: 56,
                  decoration: BoxDecoration(
                    gradient: AppTheme.primaryGradient,
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: const Icon(Icons.apps, color: Colors.white),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(software['name'] ?? '未知软件', style: const TextStyle(fontWeight: FontWeight.w600), maxLines: 1, overflow: TextOverflow.ellipsis),
                      const SizedBox(height: 4),
                      Text(software['description'] ?? '暂无描述', style: TextStyle(fontSize: 12, color: Theme.of(context).textTheme.bodySmall?.color), maxLines: 2, overflow: TextOverflow.ellipsis),
                      const SizedBox(height: 4),
                      Text('${software['download_count'] ?? 0}次下载 · ${software['size'] ?? '未知'}', style: TextStyle(fontSize: 11, color: Theme.of(context).textTheme.bodySmall?.color)),
                    ],
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildHotPosts() {
    if (_hotPosts.isEmpty) {
      return _buildEmptyState('暂无热门帖子');
    }
    return Column(
      children: _hotPosts.take(5).map<Widget>((post) {
        return Container(
          margin: const EdgeInsets.only(bottom: 12),
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: Theme.of(context).cardColor,
            borderRadius: BorderRadius.circular(16),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  CircleAvatar(radius: 16, backgroundColor: AppTheme.primaryColor, child: Text(post['nickname']?.toString().substring(0, 1) ?? 'U', style: const TextStyle(color: Colors.white, fontSize: 12))),
                  const SizedBox(width: 8),
                  Text(post['nickname'] ?? '匿名用户', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500)),
                  const Spacer(),
                  Text('LV${post['level'] ?? 1}', style: TextStyle(fontSize: 11, color: AppTheme.primaryColor)),
                ],
              ),
              const SizedBox(height: 10),
              Text(post['title'] ?? '无标题', style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600), maxLines: 2, overflow: TextOverflow.ellipsis),
              const SizedBox(height: 8),
              Row(
                children: [
                  Icon(Icons.favorite_border, size: 16, color: Theme.of(context).textTheme.bodySmall?.color),
                  const SizedBox(width: 4),
                  Text('${post['likes_count'] ?? 0}', style: TextStyle(fontSize: 12, color: Theme.of(context).textTheme.bodySmall?.color)),
                  const SizedBox(width: 16),
                  Icon(Icons.comment_outlined, size: 16, color: Theme.of(context).textTheme.bodySmall?.color),
                  const SizedBox(width: 4),
                  Text('${post['comments_count'] ?? 0}', style: TextStyle(fontSize: 12, color: Theme.of(context).textTheme.bodySmall?.color)),
                ],
              ),
            ],
          ),
        );
      }).toList(),
    );
  }

  Widget _buildEmptyState(String text) {
    return Container(
      padding: const EdgeInsets.all(32),
      decoration: BoxDecoration(
        color: Theme.of(context).cardColor,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Center(
        child: Column(
          children: [
            Icon(Icons.inbox_outlined, size: 48, color: Theme.of(context).textTheme.bodySmall?.color),
            const SizedBox(height: 12),
            Text(text, style: TextStyle(color: Theme.of(context).textTheme.bodySmall?.color)),
          ],
        ),
      ),
    );
  }
}
