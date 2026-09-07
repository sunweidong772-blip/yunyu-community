import 'package:flutter/material.dart';
import '../services/api_service.dart';
import '../utils/app_theme.dart';
import '../utils/constants.dart';

class CommunityScreen extends StatefulWidget {
  const CommunityScreen({super.key});

  @override
  State<CommunityScreen> createState() => _CommunityScreenState();
}

class _CommunityScreenState extends State<CommunityScreen> {
  final ApiService _api = ApiService();
  List<dynamic> _posts = [];
  String _currentCategory = '推荐';
  bool _isLoading = true;
  int _page = 1;

  @override
  void initState() {
    super.initState();
    _loadPosts();
  }

  Future<void> _loadPosts() async {
    setState(() => _isLoading = true);
    final result = await _api.getPosts(page: _page, category: _currentCategory);
    if (result['success']) {
      _posts = result['data']['list'] ?? [];
    }
    setState(() => _isLoading = false);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('社区'),
        actions: [
          IconButton(
            icon: const Icon(Icons.add_circle_outline),
            onPressed: () {
              // TODO: 跳转到发帖页面
            },
          ),
        ],
      ),
      body: Column(
        children: [
          // 分类Tab
          Container(
            height: 44,
            padding: const EdgeInsets.symmetric(horizontal: 8),
            child: ListView.builder(
              scrollDirection: Axis.horizontal,
              itemCount: AppConstants.communityCategories.length,
              itemBuilder: (context, index) {
                final category = AppConstants.communityCategories[index];
                final isSelected = _currentCategory == category;
                return Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                  child: ChoiceChip(
                    label: Text(category),
                    selected: isSelected,
                    onSelected: (selected) {
                      setState(() => _currentCategory = category);
                      _loadPosts();
                    },
                    selectedColor: AppTheme.primaryColor,
                    labelStyle: TextStyle(color: isSelected ? Colors.white : null),
                  ),
                );
              },
            ),
          ),
          // 帖子列表
          Expanded(
            child: _isLoading
                ? const Center(child: CircularProgressIndicator())
                : _posts.isEmpty
                    ? _buildEmptyState()
                    : RefreshIndicator(
                        onRefresh: _loadPosts,
                        child: ListView.builder(
                          padding: const EdgeInsets.all(16),
                          itemCount: _posts.length,
                          itemBuilder: (context, index) => _buildPostCard(_posts[index]),
                        ),
                      ),
          ),
        ],
      ),
    );
  }

  Widget _buildPostCard(dynamic post) {
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Theme.of(context).cardColor,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // 用户信息
          Row(
            children: [
              CircleAvatar(
                radius: 20,
                backgroundColor: AppTheme.primaryColor,
                child: Text(
                  post['nickname']?.toString().substring(0, 1) ?? 'U',
                  style: const TextStyle(color: Colors.white),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Text(post['nickname'] ?? '匿名用户', style: const TextStyle(fontWeight: FontWeight.w600)),
                        const SizedBox(width: 6),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(
                            color: AppTheme.primaryColor.withOpacity(0.1),
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: Text('LV${post['level'] ?? 1}', style: const TextStyle(fontSize: 10, color: AppTheme.primaryColor)),
                        ),
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text(post['created_at'] ?? '', style: TextStyle(fontSize: 11, color: Theme.of(context).textTheme.bodySmall?.color)),
                  ],
                ),
              ),
              if (post['is_top'] == 1)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(color: Colors.red.withOpacity(0.1), borderRadius: BorderRadius.circular(4)),
                  child: const Text('置顶', style: TextStyle(fontSize: 11, color: Colors.red)),
                ),
            ],
          ),
          const SizedBox(height: 12),
          // 标题
          Text(post['title'] ?? '无标题', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600), maxLines: 2, overflow: TextOverflow.ellipsis),
          const SizedBox(height: 8),
          // 内容摘要
          Text(post['content'] ?? '', style: TextStyle(fontSize: 14, color: Theme.of(context).textTheme.bodyMedium?.color), maxLines: 3, overflow: TextOverflow.ellipsis),
          const SizedBox(height: 12),
          // 互动栏
          Row(
            children: [
              _buildActionButton(Icons.favorite_border, '${post['likes_count'] ?? 0}', () {}),
              const SizedBox(width: 20),
              _buildActionButton(Icons.comment_outlined, '${post['comments_count'] ?? 0}', () {}),
              const SizedBox(width: 20),
              _buildActionButton(Icons.bookmark_border, '${post['favorites_count'] ?? 0}', () {}),
              const Spacer(),
              _buildActionButton(Icons.share_outlined, '分享', () {}),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildActionButton(IconData icon, String text, VoidCallback onTap) {
    return InkWell(
      onTap: onTap,
      child: Row(
        children: [
          Icon(icon, size: 18, color: Theme.of(context).textTheme.bodySmall?.color),
          const SizedBox(width: 4),
          Text(text, style: TextStyle(fontSize: 12, color: Theme.of(context).textTheme.bodySmall?.color)),
        ],
      ),
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.forum_outlined, size: 64, color: Theme.of(context).textTheme.bodySmall?.color),
          const SizedBox(height: 16),
          Text('还没有帖子，成为第一个分享的人吧', style: TextStyle(color: Theme.of(context).textTheme.bodySmall?.color)),
        ],
      ),
    );
  }
}
