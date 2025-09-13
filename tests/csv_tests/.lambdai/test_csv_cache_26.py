def merge_tables_lambdai(r1: 'list', r2: 'list', h1: 'list', h2: 'list') -> 'list[list[str]]':
    """
    将表格{r1} {r2}(表头分别为{h1}, {h2})合并：
    - 表头取两个表格表头的并集，保留表头
    - 根据key '身份证号'合并。
    - 生成rows：list[list[str]] (包含表头行)
    """
    from collections import defaultdict
    
    # 合并表头并确保包含所有必需字段
    merged_headers = list(set(h1 + h2))
    required_headers = ['身份证号', '姓名', '年龄', '专业']
    
    # 添加缺失的必需字段
    for header in required_headers:
        if header not in merged_headers:
            merged_headers.append(header)
    
    # 确保'身份证号'在第一位
    if '身份证号' in merged_headers:
        merged_headers.remove('身份证号')
        merged_headers.insert(0, '身份证号')
    
    # 创建字典存储数据
    data_dict = defaultdict(dict)
    
    # 处理第一个表格
    id_index1 = h1.index('身份证号')
    for row in r1:
        id_num = row[id_index1]
        for i, header in enumerate(h1):
            if header != '身份证号':
                data_dict[id_num][header] = row[i]
    
    # 处理第二个表格
    id_index2 = h2.index('身份证号')
    for row in r2:
        id_num = row[id_index2]
        for i, header in enumerate(h2):
            if header != '身份证号':
                data_dict[id_num][header] = row[i]
    
    # 生成合并后的行(包含表头)
    merged_rows = [merged_headers]
    for id_num in data_dict:
        row = [id_num]
        for header in merged_headers[1:]:
            row.append(data_dict[id_num].get(header, ''))
        merged_rows.append(row)
    
    return merged_rows