import 'package:flutter/material.dart';
import '../services/api_service.dart';
import '../utils/app_theme.dart';
import '../utils/constants.dart';

class SoftwareScreen extends StatefulWidget {
  const SoftwareScreen({super.key});

  @override
  State<SoftwareScreen> createState() => _SoftwareScreenState();
}

class _SoftwareScreenState extends State<SoftwareScreen> {
  final ApiService _api = ApiService();
  List<dynamic> _softwares = [];
  List<dynamic> _categories = [];
  String _currentCategory = '全部';
  String _currentSort = 'latest';
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);

    // 加载分类
    final categoryResult = await _api.getSoftwareCategories();
    if (categoryResult['success']) {
      _categories = categoryResult['data'] ?? [];
    }

    // 加载软件列表
    final softwareResult = await _api.getSoftwares(category: _currentCategory == '全部' ? null : _currentCategory, sort: _currentSort);
    if (softwareResult['success']) {
      _softwares = softwareResult['data']['list'] ?? [];
    }

    setState(() => _isLoading = false);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('软件库'),
        actions: [
          IconButton(
            icon: const Icon(Icons.search),
            onPressed: () {
              // TODO: 搜索
            },
          ),
        ],
      ),
      body: Column(
        children: [
          // 分类横向滚动
          Container(
            height: 44,
            padding: const EdgeInsets.symmetric(horizontal: 8),
            child: ListView.builder(
              scrollDirection: Axis.horizontal,
              itemCount: AppConstants.softwareCategories.length,
              itemBuilder: (context, index) {
                final category = AppConstants.softwareCategories[index];
                final isSelected = _currentCategory == category;
                return Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                  child: ChoiceChip(
                    label: Text(category),
                    selected: isSelected,
                    onSelected: (selected) {
                      setState(() => _currentCategory = category);
                      _loadData();
                    },
                    selectedColor: AppTheme.primaryColor,
                    labelStyle: TextStyle(color: isSelected ? Colors.white : null),
                  ),
                );
              },
            ),
          ),
          // 排序选项
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Row(
              children: [
                _buildSortButton('最新', 'latest'),
                const SizedBox(width: 12),
                _buildSortButton('热门', 'hot'),
                const SizedBox(width: 12),
                _buildSortButton('推荐', 'recommended'),
              ],
            ),
          ),
          // 软件列表
          Expanded(
            child: _isLoading
                ? const Center(child: CircularProgressIndicator())
                : _softwares.isEmpty
                    ? _buildEmptyState()
                    : RefreshIndicator(
                        onRefresh: _loadData,
                        child: ListView.builder(
                          padding: const EdgeInsets.all(16),
                          itemCount: _softwares.length,
                          itemBuilder: (context, index) => _buildSoftwareCard(_softwares[index]),
                        ),
                      ),
          ),
        ],
      ),
    );
  }

  Widget _buildSortButton(String label, String value) {
    final isSelected = _currentSort == value;
    return InkWell(
      onTap: () {
        setState(() => _currentSort = value);
        _loadData();
      },
      child: Text(
        label,
        style: TextStyle(
          fontSize: 13,
          fontWeight: isSelected ? FontWeight.w600 : FontWeight.normal,
          color: isSelected ? AppTheme.primaryColor : Theme.of(context).textTheme.bodySmall?.color,
        ),
      ),
    );
  }

  Widget _buildSoftwareCard(dynamic software) {
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Theme.of(context).cardColor,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        children: [
          // 软件图标
          Container(
            width: 56,
            height: 56,
            decoration: BoxDecoration(
              gradient: AppTheme.primaryGradient,
              borderRadius: BorderRadius.circular(14),
            ),
            child: const Icon(Icons.apps, color: Colors.white, size: 28),
          ),
          const SizedBox(width: 12),
          // 软件信息
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(software['name'] ?? '未知软件', style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600), maxLines: 1, overflow: TextOverflow.ellipsis),
                    ),
                    if (software['is_recommended'] == 1)
                      Container(
                        margin: const EdgeInsets.only(left: 8),
                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(color: Colors.orange.withOpacity(0.1), borderRadius: BorderRadius.circular(4)),
                        child: const Text('推荐', style: TextStyle(fontSize: 10, color: Colors.orange)),
                      ),
                  ],
                ),
                const SizedBox(height: 4),
                Text(software['description'] ?? '暂无描述', style: TextStyle(fontSize: 12, color: Theme.of(context).textTheme.bodySmall?.color), maxLines: 2, overflow: TextOverflow.ellipsis),
                const SizedBox(height: 6),
                Row(
                  children: [
                    Text('${software['version'] ?? '1.0.0'}', style: TextStyle(fontSize: 11, color: Theme.of(context).textTheme.bodySmall?.color)),
                    const SizedBox(width: 8),
                    Text('·', style: TextStyle(fontSize: 11, color: Theme.of(context).textTheme.bodySmall?.color)),
                    const SizedBox(width: 8),
                    Text('${software['size'] ?? '0MB'}', style: TextStyle(fontSize: 11, color: Theme.of(context).textTheme.bodySmall?.color)),
                    const SizedBox(width: 8),
                    Text('·', style: TextStyle(fontSize: 11, color: Theme.of(context).textTheme.bodySmall?.color)),
                    const SizedBox(width: 8),
                    Text('${software['download_count'] ?? 0}下载', style: TextStyle(fontSize: 11, color: Theme.of(context).textTheme.bodySmall?.color)),
                  ],
                ),
              ],
            ),
          ),
          // 下载按钮
          const SizedBox(width: 12),
          SizedBox(
            width: 64,
            height: 32,
            child: ElevatedButton(
              onPressed: () async {
                await _api.downloadSoftware(software['id'].toString());
                if (mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('开始下载')));
                }
              },
              style: ElevatedButton.styleFrom(padding: EdgeInsets.zero, textStyle: const TextStyle(fontSize: 12)),
              child: const Text('下载'),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.apps_outlined, size: 64, color: Theme.of(context).textTheme.bodySmall?.color),
          const SizedBox(height: 16),
          Text('暂无软件', style: TextStyle(color: Theme.of(context).textTheme.bodySmall?.color)),
        ],
      ),
    );
  }
}
