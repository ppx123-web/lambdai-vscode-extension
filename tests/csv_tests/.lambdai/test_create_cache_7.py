def generate_random_strings_lambdai() -> 'list[list[str]]':
    """
    Generate random string.Return as list[list[str]].length of outer list is 10.length of inner list is 5.
    """
    import random
    import string
    
    def generate_random_string(length):
        return ''.join(random.choice(string.ascii_letters + string.digits) for _ in range(length))
    
    outer_list = []
    for _ in range(10):
        inner_list = [generate_random_string(5) for _ in range(5)]
        outer_list.append(inner_list)
    
    return outer_list